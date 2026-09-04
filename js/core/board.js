// 三消棋盘纯逻辑引擎（无 DOM、无 Canvas）。
// 坐标 r: 0..rows-1 上->下, c: 0..cols-1 左->右。
// Cell = { color:int, special:null|'rowBomb'|'colBomb'|'rainbow', ice:int, chain:int,
//          float:bool, treasure:bool, sub:bool }
// V2.1：float 浮空格（重力悬空固定，可正常匹配消除，消除发 floatDrop）；
//       treasure 宝箱格（普通颜色+标记，被消除发 treasure）；
//       sub 子方块（color=-1 通配，匹配时充当任意颜色，run 主色 = 非子格颜色，需至少 1 个非子格）。
// 规则写死项：横 4 连 -> colBomb（清整列），竖 4 连 -> rowBomb（清整行）；
// 5 连或 L/T 交叉 -> rainbow。冰层/锁链的"相邻"均指上下左右 4 邻格。
import { RNG } from './rng.js';

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class Board {
  constructor(opts = {}) {
    this.rows = opts.rows ?? 8;
    this.cols = opts.cols ?? 8;
    this.colors = opts.colors ?? 4;
    this.rng = opts.rng instanceof RNG ? opts.rng : new RNG(opts.seed);
    const seeds = opts.seedCells || {};
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({ color: 0, special: null, ice: 0, chain: 0, float: false, treasure: false, sub: false, echo: 0, silent: 0, wasSilent: false });
      }
      this.grid.push(row);
    }
    for (const s of seeds.ice || []) if (this._in(s.r, s.c)) this.grid[s.r][s.c].ice = s.hp ?? 1;
    for (const s of seeds.chain || []) if (this._in(s.r, s.c)) this.grid[s.r][s.c].chain = s.hits ?? 3;
    for (const s of seeds.float || []) if (this._in(s.r, s.c)) this.grid[s.r][s.c].float = true;
    for (const s of seeds.treasure || []) if (this._in(s.r, s.c)) this.grid[s.r][s.c].treasure = true;
    for (const s of seeds.sub || []) {
      if (!this._in(s.r, s.c)) continue;
      const cc = this.grid[s.r][s.c];
      cc.sub = true;
      cc.color = -1; // 通配色，填充时跳过该格
    }
    for (const s of seeds.echo || []) if (this._in(s.r, s.c)) this.grid[s.r][s.c].echo = 1;
    for (const s of seeds.silent || []) {
      if (!this._in(s.r, s.c)) continue;
      const cc = this.grid[s.r][s.c];
      cc.silent = s.layer != null ? s.layer : 1;
      cc.wasSilent = true;
    }
    if (opts.noInitialMatches === false) this._fillRandom();
    else this._fillNoMatches();
  }

  // ================= 玩家操作 =================

  // 非法交换（不相邻 / chain 锁定 / 无匹配且无特殊效果）返回 null 且棋盘不变。
  swap(r1, c1, r2, c2) {
    if (!this._in(r1, c1) || !this._in(r2, c2)) return null;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return null;
    const a = this.grid[r1][c1], b = this.grid[r2][c2];
    if (!a || !b || a.chain > 0 || b.chain > 0 || a.silent > 0 || b.silent > 0) return null;
    this.grid[r1][c1] = b; this.grid[r2][c2] = a;
    const rainbowA = a.special === 'rainbow', rainbowB = b.special === 'rainbow';
    if (!rainbowA && !rainbowB && !this._matchAt(r1, c1) && !this._matchAt(r2, c2)) {
      this.grid[r1][c1] = a; this.grid[r2][c2] = b;
      return null;
    }
    const events = [{ type: 'swap', cells: [this._snapSwap(r1, c1), this._snapSwap(r2, c2)] }];
    let pending = null;
    const skip = new Set();
    if (rainbowA || rainbowB) {
      pending = new Map();
      const trigger = (rr, rc, targetColor, partnerPos) => {
        const cleared = [];
        const add = (r, c) => {
          const cc = this.grid[r][c];
          if (!cc || cc.chain > 0) return;
          cleared.push({ r, c, color: cc.color, special: cc.special });
          pending.set(this.k(r, c), { r, c });
        };
        if (targetColor === null) {
          for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) add(r, c);
        } else {
          for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            const cc = this.grid[r][c];
            if (cc && cc.color === targetColor) add(r, c);
          }
          if (partnerPos) add(partnerPos.r, partnerPos.c);
        }
        add(rr, rc); // 彩虹球自身一并消除
        events.push({ type: 'rainbow', r: rr, c: rc, color: targetColor, cleared });
        skip.add(this.k(rr, rc));
      };
      // 交换已完成：彩虹球位于其新位置
      if (rainbowA) trigger(r2, c2, b.special === 'rainbow' ? null : b.color, { r: r1, c: c1 });
      if (rainbowB) trigger(r1, c1, a.special === 'rainbow' ? null : a.color, { r: r2, c: c2 });
    }
    return this._pipeline(events, pending, [{ r: r1, c: c1 }, { r: r2, c: c2 }], null, skip);
  }

  // 返回一个可行交换 {r1,c1,r2,c2} 或 null
  useHint() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (!this._in(r2, c2)) continue;
        const a = this.grid[r][c], b = this.grid[r2][c2];
        if (!a || !b || a.chain > 0 || b.chain > 0) continue;
        this.grid[r][c] = b; this.grid[r2][c2] = a;
        const ok = a.special === 'rainbow' || b.special === 'rainbow' ||
          this._matchAt(r, c) || this._matchAt(r2, c2);
        this.grid[r][c] = a; this.grid[r2][c2] = b;
        if (ok) return { r1: r, c1: c, r2, c2 };
      }
    }
    return null;
  }

  // ================= 技能/道具用原子操作（均返回 MoveResult 形状） =================

  // 强制消除指定格：无视 chain 保护，但冰层格只掉 ice 不直接消除。
  clearCells(cells) {
    const pending = new Map();
    const forced = new Set();
    for (const p of cells || []) {
      if (!this._in(p.r, p.c)) continue;
      const k = this.k(p.r, p.c);
      const cc = this.grid[p.r][p.c];
      if (!cc || pending.has(k)) continue;
      pending.set(k, { r: p.r, c: p.c });
      if (cc.chain > 0) forced.add(k);
    }
    return this._pipeline([], pending, null, forced, null);
  }

  clearRow(r) {
    const cells = [];
    for (let c = 0; c < this.cols; c++) cells.push({ r, c });
    return this.clearCells(cells);
  }

  clearCol(c) {
    const cells = [];
    for (let r = 0; r < this.rows; r++) cells.push({ r, c });
    return this.clearCells(cells);
  }

  // rad=1 即 3x3
  clearArea(r, c, rad = 1) {
    const cells = [];
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const rr = r + dr, cc = c + dc;
      if (this._in(rr, cc)) cells.push({ r: rr, c: cc });
    }
    return this.clearCells(cells);
  }

  // 全场 fromColor -> toColor（锁链格除外），变色产生的匹配立即走连锁管线。
  convertColor(fromColor, toColor) {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cc = this.grid[r][c];
      if (cc && cc.chain === 0 && cc.color === fromColor) cc.color = toColor;
    }
    return this._pipeline([], null, null, null, null);
  }

  shuffleAll() {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cc = this.grid[r][c];
      // sub 格固定不动（保持 color=-1 通配语义），chain/特殊格不参与
      if (cc && cc.chain === 0 && !cc.special && !cc.sub) spots.push({ r, c });
    }
    const origColors = spots.map(p => this.grid[p.r][p.c].color);
    // 贪心无匹配重排：保持颜色多重集不变，按行主序放置，
    // 禁止与已放置的左二/上二同色（sub 通配感知）成 3 连；卡死则重试。
    for (let attempt = 0; attempt < 30; attempt++) {
      spots.forEach((p, i) => { this.grid[p.r][p.c].color = origColors[i]; });
      const counts = new Map();
      for (const col of origColors) counts.set(col, (counts.get(col) || 0) + 1);
      let ok = true;
      for (const p of spots) {
        const forb = new Set();
        if (p.c >= 2) this._pairForb(forb, this.grid[p.r][p.c - 1], this.grid[p.r][p.c - 2]);
        if (p.c >= 1 && p.c + 1 < this.cols && this.grid[p.r][p.c + 1].sub) {
          const q = this.grid[p.r][p.c - 1];
          if (q.sub) { for (let i = 0; i < this.colors; i++) forb.add(i); }
          else if (q.color >= 0) forb.add(q.color);
        }
        if (p.r >= 2) this._pairForb(forb, this.grid[p.r - 1][p.c], this.grid[p.r - 2][p.c]);
        if (p.r >= 1 && p.r + 1 < this.rows && this.grid[p.r + 1][p.c].sub) {
          const q = this.grid[p.r - 1][p.c];
          if (q.sub) { for (let i = 0; i < this.colors; i++) forb.add(i); }
          else if (q.color >= 0) forb.add(q.color);
        }
        const cands = [];
        for (const [col, n] of counts) if (n > 0 && !forb.has(col) && col >= 0) cands.push(col);
        if (!cands.length) { ok = false; break; }
        const col = cands[this.rng.int(cands.length)];
        this.grid[p.r][p.c].color = col;
        counts.set(col, counts.get(col) - 1);
      }
      if (ok && this._groups().length === 0) break;
    }
    return this._pipeline([], null, null, null, null);
  }

  // 随机取 n 个非特殊、非锁链格子 [{r,c}]
  randomCells(n) {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cc = this.grid[r][c];
      if (cc && !cc.special && cc.chain === 0) spots.push({ r, c });
    }
    this.rng.shuffle(spots);
    return spots.slice(0, Math.max(0, n | 0));
  }

  // 把指定格变为子方块（sub_convert Boss 技能用）
  setSub(cells) {
    const changed = [];
    for (const p of cells || []) {
      if (!this._in(p.r, p.c)) continue;
      const cc = this.grid[p.r][p.c];
      if (!cc || cc.chain > 0 || cc.silent > 0 || cc.special) continue;
      cc.sub = true;
      cc.color = -1;
      changed.push({ r: p.r, c: p.c });
    }
    return { events: changed.length ? [{ type: 'subConvert', cells: changed }] : [], score: 0, matchedCounts: {} };
  }

  // 回声石被消除后，在一个存活的正交邻格再生同色方块
  _echoRespawn(r, c, color, removed) {
    for (const [dr, dc] of ORTHO) {
      const nr = r + dr, nc = c + dc;
      if (!this._in(nr, nc)) continue;
      const k = this.k(nr, nc);
      if (removed.has(k)) continue;
      const nb = this.grid[nr][nc];
      if (!nb || nb.chain > 0 || nb.silent > 0 || nb.special || nb.sub) continue;
      nb.color = color;
      return;
    }
  }

  // 气流（V2.1）：随机选 1 列，该列顶部 n 个非 chain 格被直接吹走
  //（不计入 matchedCounts、不计玩家消除分），随后走既有重力+补充+连锁管线。
  applyWind(n = 3) {
    const col = this.rng.int(this.cols);
    const want = Math.max(0, n | 0);
    const cleared = [];
    const marks = [];
    for (let r = 0; r < this.rows && cleared.length < want; r++) {
      const cc = this.grid[r][col];
      if (!cc || cc.chain > 0) continue;
      cleared.push({ r, c: col, color: cc.color, special: cc.special });
      if (cc.float) marks.push({ type: 'floatDrop', r, c: col });
      if (cc.treasure) marks.push({ type: 'treasure', r, c: col });
      this.grid[r][col] = null;
    }
    const events = [{ type: 'wind', col, cleared }, ...marks];
    this._gravity(events);
    this._refill(events);
    return this._pipeline(events, null, null, null, null);
  }

  // ================= 内部实现 =================

  _in(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
  k(r, c) { return r * this.cols + c; }

  _fillRandom() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cc = this.grid[r][c];
      if (cc.sub) continue; // sub 格保持 -1
      cc.color = this.rng.int(this.colors);
    }
  }

  // 两格与待填格成 3 连时的禁色：sub 格视为通配。
  _pairForb(forb, a, b) {
    if (!a || !b) return;
    if (a.sub && b.sub) {
      for (let i = 0; i < this.colors; i++) forb.add(i); // [sub, sub, x] 必然成连
    } else if (a.sub) {
      if (b.color >= 0) forb.add(b.color);
    } else if (b.sub) {
      if (a.color >= 0) forb.add(a.color);
    } else if (a.color === b.color) {
      forb.add(a.color);
    }
  }

  _fillNoMatches() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cell = this.grid[r][c];
      if (cell.sub) continue; // sub 格保持 -1（通配），由邻格避让它
      const forb = new Set();
      // 行方向：[左二, 左一, 本格] 与 [左一, 本格, 右一(sub)]
      if (c >= 2) this._pairForb(forb, this.grid[r][c - 1], this.grid[r][c - 2]);
      if (c >= 1 && c + 1 < this.cols && this.grid[r][c + 1].sub) {
        const q = this.grid[r][c - 1];
        if (q.sub) { for (let i = 0; i < this.colors; i++) forb.add(i); }
        else if (q.color >= 0) forb.add(q.color);
      }
      // 列方向同理
      if (r >= 2) this._pairForb(forb, this.grid[r - 1][c], this.grid[r - 2][c]);
      if (r >= 1 && r + 1 < this.rows && this.grid[r + 1][c].sub) {
        const q = this.grid[r - 1][c];
        if (q.sub) { for (let i = 0; i < this.colors; i++) forb.add(i); }
        else if (q.color >= 0) forb.add(q.color);
      }
      const opts = [];
      for (let i = 0; i < this.colors; i++) if (!forb.has(i)) opts.push(i);
      cell.color = opts.length ? opts[this.rng.int(opts.length)] : this.rng.int(this.colors);
    }
  }

  // (r,c) 所在位置在当前棋盘上是否构成 >=3 连（sub 格通配，run 需至少 1 个非子格）
  _matchAt(r, c) {
    const cell = this.grid[r][c];
    if (!cell || cell.chain > 0) return false;
    const hit = run => run.cells.some(p => p.r === r && p.c === c);
    return this._lineRuns(true, r).some(hit) || this._lineRuns(false, c).some(hit);
  }

  // 扫描一条（或全部）行/列上每段 chain-free 区间，按颜色提取 >=3 的 run。
  // sub 格通配：同色窗口 = [该色 或 sub] 的极大连续段，且窗口内必有该色非子格。
  // 返回 [{ horiz, color, cells:[{r,c}] }]；fixed 为行/列号（null = 全部）。
  _lineRuns(horiz, fixed = null) {
    const runs = [];
    const outer = horiz ? this.rows : this.cols;
    const inner = horiz ? this.cols : this.rows;
    const at = (o, i) => (horiz ? this.grid[o][i] : this.grid[i][o]);
    const lo = fixed === null ? 0 : fixed;
    const hi = fixed === null ? outer : fixed + 1;
    for (let o = lo; o < hi; o++) {
      let i = 0;
      while (i < inner) {
        const head = at(o, i);
        if (!head || head.chain > 0 || head.silent > 0) { i++; continue; }
        let j = i + 1;
        while (j < inner) {
          const n = at(o, j);
          if (n && n.chain === 0 && n.silent === 0) j++; else break;
        }
        // 区间 [i, j)：对区间内出现过的每种颜色提取 (色|sub) 窗口
        const colors = new Set();
        for (let t = i; t < j; t++) {
          const cc = at(o, t);
          if (!cc.sub) colors.add(cc.color);
        }
        for (const X of colors) {
          let t = i;
          while (t < j) {
            const cc = at(o, t);
            if (!cc.sub && cc.color !== X) { t++; continue; }
            const s = t;
            while (t < j) {
              const n = at(o, t);
              if (n.sub || n.color === X) t++; else break;
            }
            if (t - s >= 3) {
              const cells = [];
              for (let q = s; q < t; q++) cells.push(horiz ? { r: o, c: q } : { r: q, c: o });
              runs.push({ horiz, color: X, cells });
            }
          }
        }
        i = j;
      }
    }
    return runs;
  }

  // 所有 >=3 连的 run（横/竖），并按共享格合并成组。
  // 返回 [{ color, cells:[{r,c}], runs:[{horiz,color,cells}], cellSet:Set }]
  _groups() {
    const runs = this._lineRuns(true).concat(this._lineRuns(false));
    const parent = new Map();
    const find = k => {
      while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); }
      return k;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    for (const run of runs) {
      const ks = run.cells.map(p => this.k(p.r, p.c));
      for (const k of ks) if (!parent.has(k)) parent.set(k, k);
      for (let i = 1; i < ks.length; i++) union(ks[0], ks[i]);
    }
    const groups = new Map();
    for (const run of runs) {
      const root = find(this.k(run.cells[0].r, run.cells[0].c));
      if (!groups.has(root)) groups.set(root, { color: run.color, cells: [], runs: [], cellSet: new Set() });
      const g = groups.get(root);
      g.runs.push(run);
      for (const p of run.cells) {
        const k = this.k(p.r, p.c);
        if (!g.cellSet.has(k)) { g.cellSet.add(k); g.cells.push(p); }
      }
    }
    return [...groups.values()];
  }

  // 决定匹配组生成的特殊方块；返回 {r,c,kind} 或 null
  _decideSpawn(g, swapped) {
    const hasH = g.runs.some(run => run.horiz);
    const hasV = g.runs.some(run => !run.horiz);
    let kind = null;
    if ((hasH && hasV) || g.cells.length >= 5) kind = 'rainbow';
    else if (g.cells.length === 4) kind = hasH ? 'colBomb' : 'rowBomb';
    if (!kind) return null;
    const elig = g.cells.filter(p => {
      const cc = this.grid[p.r][p.c];
      return cc && cc.ice === 0 && !cc.special && !cc.sub;
    });
    const pool = elig.length ? elig : g.cells.filter(p => {
      const cc = this.grid[p.r][p.c];
      return cc && cc.ice === 0;
    });
    if (!pool.length) return null;
    if (swapped) {
      for (const s of swapped) {
        const hit = pool.find(p => p.r === s.r && p.c === s.c);
        if (hit) return { r: hit.r, c: hit.c, kind };
      }
    }
    if (kind === 'rainbow' && hasH && hasV) {
      // L/T 交叉点优先
      const count = new Map();
      for (const run of g.runs) for (const p of run.cells) {
        const k = this.k(p.r, p.c);
        count.set(k, (count.get(k) || 0) + 1);
      }
      for (const p of pool) if (count.get(this.k(p.r, p.c)) >= 2) return { r: p.r, c: p.c, kind };
    }
    const idx = kind === 'rainbow' ? Math.floor(pool.length / 2) : Math.min(1, pool.length - 1);
    return { r: pool[idx].r, c: pool[idx].c, kind };
  }

  // 引爆 clearSet 中的特殊方块（可能连锁引爆），扩大 clearSet 并推送 bomb/rainbow 事件。
  _expandSpecials(clearSet, spawnKeys, events, skipTrigger) {
    const queue = [];
    for (const [k, p] of clearSet) {
      if (skipTrigger && skipTrigger.has(k)) continue;
      if (spawnKeys && spawnKeys.has(k)) continue;
      const cc = this.grid[p.r][p.c];
      if (cc && cc.special) queue.push(k);
    }
    const done = new Set(skipTrigger || []);
    while (queue.length) {
      const k = queue.shift();
      if (done.has(k)) continue;
      done.add(k);
      const p = clearSet.get(k);
      const cc = this.grid[p.r][p.c];
      if (!cc || !cc.special) continue;
      let affected = [];
      let targetColor = null;
      if (cc.special === 'rowBomb') {
        for (let c = 0; c < this.cols; c++) affected.push({ r: p.r, c });
      } else if (cc.special === 'colBomb') {
        for (let r = 0; r < this.rows; r++) affected.push({ r, c: p.c });
      } else { // rainbow 被波及时清除全场数量最多的颜色
        targetColor = this._mostCommonColor();
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
          const o = this.grid[r][c];
          if (o && o.chain === 0 && o.color === targetColor) affected.push({ r, c });
        }
      }
      const cleared = [];
      for (const q of affected) {
        const o = this.grid[q.r][q.c];
        if (!o || o.chain > 0) continue;
        const kk = this.k(q.r, q.c);
        cleared.push({ r: q.r, c: q.c, color: o.color, special: o.special });
        if (!clearSet.has(kk)) {
          clearSet.set(kk, { r: q.r, c: q.c });
          if (o.special && !done.has(kk)) queue.push(kk);
        }
      }
      if (cc.special === 'rainbow') events.push({ type: 'rainbow', r: p.r, c: p.c, color: targetColor, cleared });
      else events.push({ type: 'bomb', r: p.r, c: p.c, kind: cc.special, cleared });
    }
  }

  _mostCommonColor() {
    const counts = new Array(Math.max(1, this.colors)).fill(0);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const cc = this.grid[r][c];
      if (cc && cc.chain === 0 && cc.color >= 0 && cc.color < counts.length) counts[cc.color]++;
    }
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    return best;
  }

  // 重力掉落：chain 格与 float 格悬空固定（作为分段边界），其上方方块照常下落堆积其上。
  _gravity(events) {
    const moves = [];
    for (let c = 0; c < this.cols; c++) {
      let segBottom = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        const cell = this.grid[r][c];
        if (cell && (cell.chain > 0 || cell.float || cell.silent > 0)) {
          this._compactSeg(c, r + 1, segBottom, moves);
          segBottom = r - 1;
        }
      }
      if (segBottom >= 0) this._compactSeg(c, 0, segBottom, moves);
    }
    if (moves.length) events.push({ type: 'fall', moves });
  }

  _compactSeg(c, top, bottom, moves) {
    if (top > bottom) return;
    const blocks = [];
    for (let r = bottom; r >= top; r--) {
      const cell = this.grid[r][c];
      if (cell) blocks.push({ cell, from: r });
    }
    let w = bottom;
    for (const b of blocks) {
      if (w !== b.from) {
        this.grid[w][c] = b.cell;
        this.grid[b.from][c] = null;
        moves.push({ from: { r: b.from, c }, to: { r: w, c }, cell: b.cell });
      }
      w--;
    }
    for (let r = w; r >= top; r--) if (this.grid[r][c]) this.grid[r][c] = null;
  }

  // 补充：只填补真正的空位（顶部段空位即顶部补充；被锁链挡住的内部空位原位补充）。
  _refill(events) {
    const cells = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!this.grid[r][c]) {
        const cell = { color: this.rng.int(this.colors), special: null, ice: 0, chain: 0, float: false, treasure: false, sub: false, echo: 0, silent: 0, wasSilent: false };
        this.grid[r][c] = cell;
        cells.push({ r, c, cell });
      }
    }
    if (cells.length) events.push({ type: 'refill', cells });
  }

  // 统一管线：消除 -> 特殊方块 -> 冰/链 -> 计分 -> 重力 -> 补充 -> 连锁检测循环。
  _pipeline(events, pending = null, swapped = null, forced = null, skipTrigger = null) {
    let chainIndex = 0, moves = 0, score = 0;
    const matchedCounts = {};
    let specialCreated = null;
    let first = true, guard = 0;
    while (guard++ < 200) {
      const groups = this._groups();
      const clearSet = new Map();
      if (first && pending) for (const [k, v] of pending) clearSet.set(k, v);
      for (const g of groups) for (const p of g.cells) clearSet.set(this.k(p.r, p.c), p);
      if (clearSet.size === 0) break;
      // sub 格在 match 事件 / matchedCounts 里记所在 run 的主色
      const effColor = new Map();
      for (const g of groups) for (const p of g.cells) effColor.set(this.k(p.r, p.c), g.color);
      const matchCells = [...clearSet.values()].map(p => {
        const cc = this.grid[p.r][p.c];
        const k = this.k(p.r, p.c);
        const color = (cc.sub && effColor.has(k)) ? effColor.get(k) : cc.color;
        return { r: p.r, c: p.c, color, special: cc.special };
      });
      // 4/5 连生成本次特殊方块（生成格本回合不清除）
      const spawnKeys = new Set();
      const spawnInfos = [];
      for (const g of groups) {
        const sp = this._decideSpawn(g, first ? swapped : null);
        if (!sp) continue;
        spawnKeys.add(this.k(sp.r, sp.c));
        spawnInfos.push(sp);
        this.grid[sp.r][sp.c].special = sp.kind;
        if (!specialCreated) {
          specialCreated = { r: sp.r, c: sp.c, kind: sp.kind, color: this.grid[sp.r][sp.c].color };
        }
      }
      const matchEvent = { type: 'match', cells: matchCells, score: 0, chainIndex };
      events.push(matchEvent);
      for (const s of spawnInfos) {
        events.push({ type: 'specialSpawn', r: s.r, c: s.c, kind: s.kind });
        clearSet.delete(this.k(s.r, s.c));
      }
      this._expandSpecials(clearSet, spawnKeys, events, skipTrigger);
      // 初步移除集合（跳过 chain 保护与冰层保护格）
      const removed = new Set();
      for (const [k, p] of clearSet) {
        const cc = this.grid[p.r][p.c];
        if (!cc) continue;
        if (cc.chain > 0 && !(forced && forced.has(k))) continue;
        if (cc.silent > 0 && !(forced && forced.has(k))) continue;
        if (cc.ice > 0) continue;
        removed.add(k);
      }
      // 冰层：本格或相邻格参与消除 -> ice-1；本格参与且归零则本格被消除
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const cc = this.grid[r][c];
        if (!cc || cc.ice <= 0) continue;
        const k = this.k(r, c);
        const inSet = clearSet.has(k);
        let near = false;
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr, nc = c + dc;
          if (this._in(nr, nc) && clearSet.has(this.k(nr, nc))) { near = true; break; }
        }
        if (!inSet && !near) continue;
        cc.ice--;
        events.push({ type: 'iceBreak', r, c, hp: cc.ice });
        if (cc.ice === 0 && inSet) removed.add(k);
      }
      // 锁链：相邻格参与消除 -> chain-1，归零解锁（方块保留）
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const cc = this.grid[r][c];
        if (!cc || cc.chain <= 0) continue;
        const k = this.k(r, c);
        if (forced && forced.has(k)) continue;
        let near = false;
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr, nc = c + dc;
          if (this._in(nr, nc) && clearSet.has(this.k(nr, nc))) { near = true; break; }
        }
        if (!near) continue;
        cc.chain--;
        if (cc.chain === 0) events.push({ type: 'chainOpen', r, c });
      }
      // 静音区：相邻格参与消除 -> silent-1，归零解锁（方块保留）
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const cc = this.grid[r][c];
        if (!cc || cc.silent <= 0) continue;
        let near = false;
        for (const [dr, dc] of ORTHO) {
          const nr = r + dr, nc = c + dc;
          if (this._in(nr, nc) && clearSet.has(this.k(nr, nc))) { near = true; break; }
        }
        if (!near) continue;
        cc.silent--;
        if (cc.silent === 0) events.push({ type: 'silentOpen', r, c });
      }
      // 结算移除与得分：每格 10 分 x (1 + 0.2 x chainIndex)
      let n = 0;
      for (const k of removed) {
        const p = clearSet.get(k);
        const cc = this.grid[p.r][p.c];
        const eff = (cc.sub && effColor.has(k)) ? effColor.get(k) : cc.color;
        matchedCounts[eff] = (matchedCounts[eff] || 0) + 1;
        if (cc.float) events.push({ type: 'floatDrop', r: p.r, c: p.c });
        if (cc.treasure) events.push({ type: 'treasure', r: p.r, c: p.c });
        if (cc.wasSilent) events.push({ type: 'silentCleared', r: p.r, c: p.c });
        if (cc.echo > 0) {
          events.push({ type: 'echoCleared', r: p.r, c: p.c, color: eff });
          this._echoRespawn(p.r, p.c, eff, removed);
        }
        this.grid[p.r][p.c] = null;
        n++;
      }
      const roundScore = n * 10 * (1 + 0.2 * chainIndex);
      score += roundScore;
      matchEvent.score = roundScore;
      this._gravity(events);
      this._refill(events);
      moves++; chainIndex++;
      first = false; pending = null;
    }
    return { events, score, matchedCounts, specialCreated, moves };
  }

  _snapSwap(r, c) {
    const cc = this.grid[r][c];
    return { r, c, color: cc.color, ice: cc.ice, chain: cc.chain };
  }
}
