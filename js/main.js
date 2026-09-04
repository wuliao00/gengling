// main.js — 启动与粘合：Meta 初始化、战斗主循环、目标进度统计
import { Board } from './core/board.js';
import { RNG } from './core/rng.js';
import { Battle } from './game/battle.js';
import { Meta } from './game/meta.js';
import { Sfx, Bgm } from './game/sfx.js';
import { CHARACTERS } from './data/characters.js';
import { ITEMS } from './data/items.js';
import { BoardRenderer } from './ui/render.js';
import { BoardInput } from './ui/input.js';
import { Scenes, toast, updateTopbar, modalBox, goalText } from './ui/scenes.js';
import { loadArt } from './ui/art.js';

const COLOR_NAMES = ['红', '蓝', '绿', '黄', '紫', '橙'];
// 与 render.js CELL_COLORS 对应的色块（颜色转换瓶弹窗用）
const COLOR_DOTS = ['#FF6B6B', '#5BA8FF', '#6BCB77', '#FFD93D', '#B983FF', '#FF9F45'];

const Game = {
  level: null,
  board: null,
  battle: null,
  team: [],            // 出战角色完整对象（含 hp/atk/mult/skill/passive/skillLv）
  broughtItems: [],    // 带入战斗的道具 key
  renderer: new BoardRenderer(),
  input: null,
  busy: false,
  movesUsed: 0,
  stepsLeft: 0,
  pickMode: null,      // {item:'hammer'|'crossBomb', from:'color'} 目标选择状态
  timerId: 0,
  progress: null,
  result: null,
  auto: false,          // 自动战斗开关（自动放技能 + 自动消除）
  _autoTimer: 0,

  // ============ 启动 ============
  start() {
    Meta.init();
    Sfx.setMuted(!!Meta.get().progress.muted);
    // 首次手势解锁音频（浏览器自动播放策略）；首个手势播开场音；UI 按钮统一点击音
    let _audioOpened = false;
    document.addEventListener('pointerdown', (e) => {
      Sfx.unlock();
      if (!_audioOpened) { _audioOpened = true; setTimeout(() => { Sfx.play('opening'); Bgm.kick(); }, 80); }
      const tgt = e.target;
      if (tgt && tgt.closest) {
        const noClick = tgt.closest('.skill-btn, .item-btn');   // 这两类有各自音效，不叠加点击音
        const ui = tgt.closest('button, .lv-node, .wm-node, .team-slot, .char-card, .item-check, .shop-tab, .chap-tab');
        if (ui && !noClick) Sfx.play('click');
      }
      Bgm.kick();
    }, { passive: true });
    // V5 开发者模式：?dev=1 持久化开启；顶栏标题 5 连点也可开启
    const qDev = new URLSearchParams(location.search).get('dev');
    if (qDev === '1') { Meta.get().progress.dev = true; Meta.persist(); }
    let _devTaps = 0, _devT0 = 0;
    const tbTitle = document.getElementById('tbTitle');
    if (tbTitle) tbTitle.addEventListener('click', () => {
      const now = Date.now();
      if (now - _devT0 > 2500) _devTaps = 0;
      _devT0 = now; _devTaps++;
      if (_devTaps >= 5) {
        _devTaps = 0;
        const s = Meta.get();
        s.progress.dev = true; Meta.persist();
        toast('🛠 开发者模式已开启（首页可见面板）');
        Scenes.show('home');
      }
    });

    // 调试入口：?goto=关卡id 直接解锁并进入该关编队（开发用）
    const goto = parseInt(new URLSearchParams(location.search).get('goto'), 10);
    if (goto > 1) {
      const s = Meta.get();
      s.unlockedLevels = Math.max(s.unlockedLevels, goto);
      s.energy = Math.max(s.energy, 10);
      Meta.persist();
    }
    // 预载 AI 立绘（最多 1.2s，超时不阻塞），避免首屏先矢量后贴图的闪变
    loadArt(1200).then(() => {
      Scenes.init(this);
      if (goto > 1) {
        Scenes._levelId = goto;
        Scenes.show('lineup');
      }
    });
  },

  // ============ 开战 ============
  startBattle(level, teamIds, itemKeys, opts = {}) {
    // 赌局关：先选模式
    const sp0 = level.special || '';
    if (!opts.decided && ((level.goal || {}).kind === 'gamble' || sp0.includes('赌局'))) {
      modalBox('<div class="mb-title">🎲 赌局选择</div><div class="mb-text">高风险高回报：敌人 HP×2，通关金币×2！</div>', [
        { text: '普通模式', cls: 'btn-soft', fn: () => this.startBattle(level, teamIds, itemKeys, { decided: true }) },
        { text: '高风险模式 💎', cls: 'btn-primary', fn: () => this.startBattle(level, teamIds, itemKeys, { decided: true, highRisk: true }) },
      ]);
      return;
    }
    this.level = level;
    this.highRisk = !!opts.highRisk;
    if (!opts.endless) { this.endless = null; this._stopAuto(); }
    this.broughtItems = itemKeys || [];
    const rng = new RNG((Date.now() ^ (level.id * 7919)) % 2147483647);
    const def = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
    this.team = teamIds.filter(Boolean).map(id => {
      const p = Meta.charPower(id);
      return {
        id, name: def[id].name,
        hp: p.hp, atk: p.atk, mult: p.mult,
        skillLv: Meta.get().chars[id].skillLv,
        skill: def[id].skill, passive: def[id].passive,
      };
    });

    // ===== 关卡机制识别（第三/四章特殊棋盘机制）=====
    const sp = level.special || '';
    const goalStr = JSON.stringify(level.goal || {});
    this.mech = {
      wind: sp.includes('气流'),
      slot: sp.includes('老虎机') || goalStr.includes('slot'),
      gamble: this.highRisk, // 高风险模式记录（金币加倍）
    };
    // 敌人 trait 归一化（levels 命名 → battle 命名）
    const TRAIT_MAP = { noiseWave: 'noise', lightning: 'thunder', windMove: 'gust', subBlock: 'sub_convert', allIn: 'allin' };
    const enemies = (level.enemies || []).map(e => Object.assign({}, e, {
      trait: TRAIT_MAP[e.trait] || e.trait,
      traitEvery: (e.traitParam && e.traitParam.every) || e.traitEvery || 3,
    }));
    if (this.highRisk) enemies.forEach(e => { e.hp = Math.round(e.hp * 2); });
    const lvl = Object.assign({}, level, { enemies });

    // ===== 棋盘种子（浮空/宝箱/子方块，按关卡机制确定性生成）=====
    const bd = level.board || {};
    const seedCells = { ice: bd.ice, chain: bd.chain, echo: bd.echo, silent: bd.silent };
    if (sp.includes('浮空')) seedCells.float = this._patternCells(level.id * 31 + 5, 8, seedCells);
    if (sp.includes('宝箱')) seedCells.treasure = this._patternCells(level.id * 17 + 3, 3, seedCells);
    if (sp.includes('子方块')) seedCells.sub = this._patternCells(level.id * 13 + 11, 6, seedCells);
    this.initialSubs = (seedCells.sub || []).length;

    this.board = new Board({
      colors: level.colors || 4,
      seedCells,
      rng,
    });
    this.battle = new Battle(lvl, this.team, this.board, rng);
    this.movesUsed = 0;
    this.stepsLeft = level.steps || 0;
    this.busy = false;
    this.pickMode = null;
    this.floatDrops = 0;
    this.treasures = 0;
    this.slotTriggers = 0;
    this._lastMove = null;
    this._initProgress();
    Scenes.show('battle');
    this.renderer.attach(document.getElementById('board'), this.board);
    this.renderer.setFog(false);
    this.renderer.setRowLocks([]);
    // V5 BGM：Boss 关用紧张曲；普通战斗在 3 首战斗曲间轮换（按关卡 id），满足"战斗背景音≥2 种"
    const isBoss = level.boss || level.type === 'boss';
    const battleTracks = ['battle', 'battle2', 'battle3'];
    Bgm.play(isBoss ? 'boss' : battleTracks[Math.abs(level.id || 1) % battleTracks.length]);
    if (isBoss) Sfx.play('boss');
    this._startTimer();
    toast(`第${level.id}关：${goalText(level)}`, 2400);
  },

  /** 确定性伪随机格位生成（避开 ice/chain 占用格） */
  _patternCells(seed, n, seedCells) {
    const used = new Set();
    for (const s of (seedCells.chain || [])) used.add(s.r * 8 + s.c);
    for (const s of (seedCells.ice || [])) used.add(s.r * 8 + s.c);
    let x = (seed * 2654435761) % 4294967296;
    const rnd = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
    const out = [];
    while (out.length < n && used.size < 64) {
      const r = Math.floor(rnd() * 8), c = Math.floor(rnd() * 8), k = r * 8 + c;
      if (used.has(k)) continue;
      used.add(k);
      out.push({ r, c });
    }
    return out;
  },

  _initProgress() {
    this.progress = {
      score: 0,
      matchedCounts: {},
      fourMatch: 0,
      fiveMatch: 0,
      bombCleared: 0,
      rainbowCleared: {},
      chainOpened: 0,
      echoCleared: 0,
      silentCleared: 0,
      totalCleared: 0,
    };
  },

  // ============ 棋盘 UI 绑定（battle 场景渲染后调用） ============
  bindBoardUI(box) {
    const canvas = box.querySelector('#board');
    this.renderer.attach(canvas, this.board);
    if (this.input) this.input = null;
    this.input = new BoardInput(canvas, {
      onSwap: (r1, c1, r2, c2) => this.doSwap(r1, c1, r2, c2),
      onPickCell: (r, c) => this.onPickCell(r, c),
      isPickMode: () => !!this.pickMode,
      getMetrics: () => this.renderer.metrics,
    });
  },

  // ============ 主循环：一次交换 ============
  async doSwap(r1, c1, r2, c2) {
    if (this.busy || !this.board || this.battle.state.over) return;
    // 行封锁检查（Boss 落石/噪音波）
    const locked = new Set((this.battle.state.rowLocks || []).map(x => x.row));
    if (locked.has(r1) || locked.has(r2)) { toast('这行被封印了，先解除封锁！'); return; }
    const res = this.board.swap(r1, c1, r2, c2);
    if (!res) { Sfx.play('invalid'); return; } // 非法交换，引擎已还原棋盘
    this.busy = true;
    this.input.setLocked(true);
    Sfx.play('swap');
    try {
      this.movesUsed++;
      if (this.level.steps > 0) this.stepsLeft = Math.max(0, this.stepsLeft - 1);
      await this.renderer.playEvents(res.events);
      // 消除类音效（match 按连锁升调）
      for (const ev of (res.events || [])) {
        if (ev.type === 'match') Sfx.play('match', { step: ev.chainIndex || 0 });
        else if (ev.type === 'bomb') Sfx.play('bomb');
        else if (ev.type === 'rainbow') Sfx.play('rainbow');
        else if (ev.type === 'treasure') Sfx.play('treasure');
        else if (ev.type === 'wind') Sfx.play('wind');
      }
      this._accProgress(res);
      this._lastMove = res;

      // 结算伤害/敌人回合
      const br = this.battle.onMoveResult(res);
      if (br.damage > 0) {
        Sfx.play('hit');
        this.renderer.floatText('-' + br.damage, this.renderer.cssW / 2, 30, 'dmg');
        this.renderer.shake();
      }
      Scenes.refreshEnemies(br.damage > 0 ? this.battle.targetIdx : -1);

      // 目标判定
      if (!this.battle.state.over) this._checkGoal();

      // 回合后处理：Boss技能特效/敌人冲撞/气流/老虎机/押注/行锁/雾
      if (!this.battle.state.over) await this._processTurn();

      this.refreshBattleHUD();

      if (this.battle.state.over) {
        this._endBattle();
      } else if (this.level.steps > 0 && this.stepsLeft <= 0) {
        this._fail('步数用完啦！就差一点点…');
      }
    } catch (err) {
      console.error(err);
      toast('出错了：' + err.message);
    } finally {
      this.busy = false;
      if (this.input) this.input.setLocked(false);
    }
  },

  /** 回合后演出与机制触发 */
  async _processTurn() {
    const b = this.battle;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    for (const ev of (b.turnEvents || [])) {
      if (ev.kind === 'bossSkill') {
        Sfx.play('boss_skill');
        await this.renderer.playFx('bossSkill', { name: ev.name });
        const bevs = (b._bossEvents || []).splice(0);
        if (bevs.length) await this.renderer.playEvents(bevs);
        if (ev.trait === 'summon') Scenes.rebuildEnemies();
        this.refreshBattleHUD();
      } else if (ev.kind === 'enemyAttack') {
        this._enemyLunge(ev.enemy);
        if (ev.blocked) {
          Sfx.play('shield');
          this.renderer.floatText('🛡 格挡!', this.renderer.cssW / 2, this.renderer.cssH * 0.62);
          toast('🛡 梗之护盾完全抵消了这次攻击！', 1100);
        } else if (ev.target != null && ev.target >= 0) {
          if (ev.shielded) { Sfx.play('shield'); this.renderer.floatText(`🛡 减伤${Math.round((ev.reduce || 0) * 100)}%`, this.renderer.cssW / 2, this.renderer.cssH * 0.62, 'heal'); }
          this._memberHit(ev.target, ev.dmg);
        }
        Scenes.refreshEnemies();
        await sleep(320);
      } else if (ev.kind === 'heal') {
        // 被动/共鸣回血：绿飘字 + 轻提示（让"被动"可见）
        this.renderer.floatText('+' + ev.amount, this.renderer.cssW / 2, this.renderer.cssH * 0.55, 'heal');
        toast(`💚 ${ev.name || '被动'}：全队回复 ${ev.amount} HP`, 1100);
        this.refreshBattleHUD();
      } else if (ev.kind === 'memberFainted') {
        const m = this.team[ev.target];
        toast(`💔 ${m ? m.name : '队友'} 倒下了！`);
        this.refreshBattleHUD();
      } else if (ev.kind === 'betResult') {
        toast(ev.hit ? `🎲 押注命中！${(b.state.enemies[ev.enemy] || {}).name} 回血了` : '🎲 破了庄家的注！敌人 -500');
      }
    }

    // 行锁定 / 雾 持续状态同步到渲染
    this.renderer.setRowLocks((b.state.rowLocks || []).map(x => x.row));
    this.renderer.setFog((b.state.fogTurns || 0) > 0);

    // 押注判定：玩家本回合消除最多的颜色
    if (b.betColor != null && this._lastMove) {
      const mc = this._lastMove.matchedCounts || {};
      let best = null, bn = 0;
      for (const k of Object.keys(mc)) if (mc[k] > bn) { bn = mc[k]; best = +k; }
      if (best != null) b.playerClearsColor(best, bn);
    }

    // 气流：每 2 回合吹走 1 列顶部
    if (this.mech.wind && this.movesUsed % 2 === 0) {
      const wr = this.board.applyWind(3);
      const evs = Array.isArray(wr) ? wr : (wr && wr.events) || [];
      const wEv = evs.find(e => e.type === 'wind');
      await this.renderer.playFx('wind', { col: wEv ? wEv.col : 0 });
      await this.renderer.playEvents(evs);
    }

    // 老虎机：每 5 回合触发
    if (this.mech.slot && b.state.slotCounter > 0 && b.state.slotCounter % 5 === 0) {
      await this._slotMachine();
    }
  },

  /** 敌人攻击冲撞动画 */
  _enemyLunge(idx) {
    const card = document.querySelectorAll('#btEnemies .enemy-card')[idx];
    if (!card) return;
    card.classList.remove('atk');
    void card.offsetWidth;
    card.classList.add('atk');
    setTimeout(() => card.classList.remove('atk'), 520);
  },

  /** 成员受击动画 + 飘字 */
  _memberHit(idx, dmg) {
    Sfx.play('hurt');
    const card = document.querySelectorAll('#btMembers .member-card')[idx];
    if (!card) return;
    card.classList.remove('hit');
    void card.offsetWidth;
    card.classList.add('hit');
    if (dmg > 0) {
      const f = document.createElement('div');
      f.className = 'dmg-float';
      f.textContent = '-' + dmg;
      card.appendChild(f);
      setTimeout(() => f.remove(), 900);
    }
    this.refreshBattleHUD();
  },

  /** 老虎机弹窗（第三/四章机制） */
  _slotMachine() {
    return new Promise((resolve) => {
      const SYM = ['🍒', '🔔', '⭐', '💎'];
      this.slotTriggers++;
      const mask = modalBox(`
        <div class="mb-title">🎰 老虎机启动！</div>
        <div class="slot-reels">
          <div class="slot-reel spin" id="sr0">🍒</div>
          <div class="slot-reel spin" id="sr1">🔔</div>
          <div class="slot-reel spin" id="sr2">⭐</div>
        </div>
        <div class="slot-result" id="slotRes">转动中…</div>`, []);
      const iv = setInterval(() => {
        Sfx.play('slot');
        for (let i = 0; i < 3; i++) {
          const elx = document.getElementById('sr' + i);
          if (elx) elx.textContent = SYM[Math.floor(Math.random() * SYM.length)];
        }
      }, 90);
      setTimeout(() => {
        clearInterval(iv);
        const fin = [0, 1, 2].map(() => Math.floor(Math.random() * SYM.length));
        for (let i = 0; i < 3; i++) {
          const elx = document.getElementById('sr' + i);
          if (elx) { elx.textContent = SYM[fin[i]]; elx.classList.remove('spin'); }
        }
        const s = Meta.get();
        const pool = ['hammer', 'crossBomb', 'colorBottle', 'extraSteps', 'shield'];
        let msg;
        if (fin[0] === fin[1] && fin[1] === fin[2]) {
          for (const k of pool) s.items[k] = (s.items[k] || 0) + 1;
          Meta.addGold(200);
          msg = '🎉 大奖！全道具 +1，金币 +200！';
        } else if (fin[0] === fin[1] || fin[1] === fin[2] || fin[0] === fin[2]) {
          const k = pool[Math.floor(Math.random() * pool.length)];
          s.items[k] = (s.items[k] || 0) + 1;
          msg = `中奖！${ITEMS[k].name} +1`;
        } else {
          msg = '谢谢参与～下把一定行！';
        }
        Meta.persist();
        const res = document.getElementById('slotRes');
        if (res) res.textContent = msg;
        setTimeout(() => { mask.remove(); resolve(); }, 1500);
      }, 1700);
    });
  },

  /** 累计目标进度 */
  _accProgress(res) {
    const P = this.progress;
    P.score += res.score || 0;
    for (const [k, v] of Object.entries(res.matchedCounts || {})) {
      P.matchedCounts[k] = (P.matchedCounts[k] || 0) + v;
      P.totalCleared += v;
    }
    for (const ev of res.events || []) {
      if (ev.type === 'specialSpawn' && (ev.kind === 'rowBomb' || ev.kind === 'colBomb')) P.fourMatch++;
      if (ev.type === 'specialSpawn' && ev.kind === 'rainbow') P.fiveMatch++;
      if (ev.type === 'bomb') P.bombCleared += (ev.cleared || []).length;
      if (ev.type === 'rainbow') {
        for (const cc of ev.cleared || []) P.rainbowCleared[cc.color] = (P.rainbowCleared[cc.color] || 0) + 1;
      }
      if (ev.type === 'chainOpen') P.chainOpened++;
      if (ev.type === 'echoCleared') P.echoCleared++;
      if (ev.type === 'silentCleared') P.silentCleared++;
      if (ev.type === 'floatDrop') this.floatDrops++;
      if (ev.type === 'treasure') this.treasures++;
    }
  },

  /** 单个 goal 是否达成（返回 {ok, count}） */
  _goalDone(g) {
    const P = this.progress;
    const cnt = (n) => ({ ok: (P.totalCleared >= n), count: Math.min(P.totalCleared, n) });
    switch (g.kind) {
      case 'collect': {
        if (Array.isArray(g.list)) {
          const ok = g.list.every(p => (P.matchedCounts[p.color] || 0) >= p.count);
          return { ok, count: 0 };
        }
        if (g.color == null) return cnt(g.count);
        const n = P.matchedCounts[g.color] || 0;
        return { ok: n >= g.count, count: Math.min(n, g.count) };
      }
      case 'score': case 'timed':
        return { ok: P.score >= g.score, count: Math.min(P.score, g.score) };
      case 'fourMatch': return { ok: P.fourMatch >= g.count, count: Math.min(P.fourMatch, g.count) };
      case 'fiveMatch': return { ok: P.fiveMatch >= g.count, count: Math.min(P.fiveMatch, g.count) };
      case 'bombClear': return { ok: P.bombCleared >= g.count, count: Math.min(P.bombCleared, g.count) };
      case 'chainClear': return { ok: P.chainOpened >= g.count, count: Math.min(P.chainOpened, g.count) };
      case 'rainbowRed': {
        // 教学目标：成功用彩虹球消除该颜色即过关（棋盘补充会不断刷新新方块，
        // "场上不存在该颜色"在数学上几乎不可达成，属设计 bug，见 2026-08-30 修复）
        const n = P.rainbowCleared[g.color] || 0;
        return { ok: n > 0, count: n };
      }
      case 'enemy':
        return { ok: this.battle.aliveEnemies().length === 0, count: 0 };
      case 'floatClear': {
        const n = this.floatDrops;
        return { ok: n >= (g.count || 1), count: Math.min(n, g.count || 1) };
      }
      case 'treasure': {
        const n = this.treasures;
        return { ok: n >= (g.count || 1), count: Math.min(n, g.count || 1) };
      }
      case 'subClear': {
        let remain = 0;
        for (const row of this.board.grid) for (const cell of row) if (cell && cell.sub) remain++;
        const n = this.initialSubs - remain;
        return { ok: n >= (g.count || 1), count: Math.max(0, Math.min(n, g.count || 1)) };
      }
      case 'slot': {
        const n = this.slotTriggers;
        return { ok: n >= (g.count || 1), count: Math.min(n, g.count || 1) };
      }
      case 'gamble':
        return { ok: this.battle.aliveEnemies().length === 0, count: 0 };
      case 'silentClear':
        return { ok: this.progress.silentCleared >= (g.count || 1), count: Math.min(this.progress.silentCleared, g.count || 1) };
      case 'clearEcho':
        return { ok: this.progress.echoCleared >= (g.count || 1), count: Math.min(this.progress.echoCleared, g.count || 1) };
      // 引擎未实现的机制类目标：以总消除数兜底，保证可通关
      case 'treasure2':
        return cnt(g.count || 1);
      default:
        return { ok: false, count: 0 };
    }
  },

  _checkGoal() {
    const g = this.level.goal || {};
    if (g.kind === 'enemy') {
      this.battle.checkGoal({});
      return;
    }
    if (g.kind === 'combo') {
      const parts = g.parts || [];
      if (parts.length && parts.every(p => this._goalDone(p).ok)) {
        this.battle.state.over = true;
        this.battle.state.win = true;
      }
      return;
    }
    const { ok } = this._goalDone(g);
    if (ok) {
      this.battle.state.over = true;
      this.battle.state.win = true;
    }
  },

  // ============ 技能 ============
  async useSkill(idx) {
    if (this.busy || !this.battle || this.battle.state.over) return;
    const ch = this.team[idx];
    if (!ch) return;
    const member = (this.battle.state.members || [])[idx];
    if (member && member.fainted) { toast(`${ch.name} 已经倒下了，无法释放技能！`); return; }
    const cd = this.battle.state.skillCds[ch.id] || 0;
    if (cd > 0) { toast(`${ch.name}技能冷却中（还剩${cd}回合）`); return; }
    this.busy = true;
    this.input.setLocked(true);
    try {
      // 施法演出：成员前倾 + 技能色光效 + 角色专属招式音
      Sfx.play(Sfx.has('skill_' + ch.id) ? 'skill_' + ch.id : 'skill');
      const card = document.querySelectorAll('#btMembers .member-card')[idx];
      if (card) card.classList.add('cast');
      this.renderer.playFx('skillCast', { charId: ch.id, color: idx % 6 });
      const r = this.battle.useSkill(idx);
      if (r.ok) {
        Meta.addFavorExp(ch.id, 5);
        if (r.wheel) toast(`🎰 命运转盘：${r.wheel}！`, 2000);
        else toast(`${ch.name}发动【${ch.skill.name}】！`, 1400);
        if (r.stunned) { Sfx.play('stun'); setTimeout(() => toast(`💫 【震慑】${r.stunned} 跳过一回合！`, 1200), 480); }
        await this.renderer.playEvents(r.events || []);
        // V5：技能清除的方块同样计入关卡目标进度
        this._accProgress({ score: r.score || 0, matchedCounts: r.matchedCounts || {}, events: r.events || [] });
        if (r.damage > 0) {
          this.renderer.floatText('-' + r.damage, this.renderer.cssW / 2, 30, 'dmg');
          this.renderer.shake();
        }
        Scenes.refreshEnemies(r.damage > 0 ? this.battle.targetIdx : -1);
        if (!this.battle.state.over) {
          this._checkGoal();
          if (!this.battle.state.over) await this._processTurn();
        }
        this.refreshBattleHUD();
        if (this.battle.state.over) this._endBattle();
        else if (this.level.steps > 0 && this.stepsLeft <= 0) this._fail('步数用完啦！');
      }
      if (card) setTimeout(() => card.classList.remove('cast'), 500);
    } catch (err) {
      console.error(err);
      toast('出错了：' + err.message);
    } finally {
      this.busy = false;
      if (this.input) this.input.setLocked(false);
    }
  },

  // ============ 道具 ============
  useItem(key) {
    if (this.busy || !this.battle || this.battle.state.over) return;
    const s = Meta.get();
    if ((s.items[key] || 0) <= 0) { toast('道具不足'); return; }
    if (key === 'extraSteps') {
      s.items[key]--; Meta.persist();
      this.battle.useItem('extraSteps');
      this.stepsLeft += 5;
      toast('步数 +5，继续加油！');
      this.refreshBattleHUD();
      return;
    }
    if (ITEMS[key] && typeof ITEMS[key].shieldReduce === 'number') {
      // 梗之护盾（分级减伤）：即时生效，不消耗回合
      s.items[key]--; Meta.persist();
      this.battle.useItem(key);
      Sfx.play('shield');
      const pct = Math.round(ITEMS[key].shieldReduce * 100);
      toast(`🛡 ${ITEMS[key].name} 就位：下次受击减伤 ${pct}%！`);
      this.refreshBattleHUD();
      return;
    }
    if (key === 'hammer' || key === 'crossBomb') {
      this.pickMode = { item: key };
      this.renderer.setHighlight(this._allCells());
      toast('点击棋盘上要作用的方块');
      return;
    }
    if (key === 'colorBottle') {
      // 选来源色 → 目标色（排除子方块通配色 -1；按钮带色块方便辨认）
      const present = [...new Set(this.board.grid.flat().map(c => c.color).filter(c => c != null && c >= 0))];
      const btns = present.map(c => ({ text: COLOR_NAMES[c] + '色', cls: 'btn-soft', dot: COLOR_DOTS[c], fn: () => this._pickBottleTo(c) }));
      modalBox('<div class="mb-title">把哪种颜色变成别的颜色？</div>', btns.concat([{ text: '取消', cls: 'btn-ghost' }]));
    }
  },

  _pickBottleTo(from) {
    const present = [...new Set(this.board.grid.flat().map(c => c.color).filter(c => c != null && c >= 0 && c !== from))];
    if (!present.length) { toast('没有其他颜色可变'); return; }
    const btns = present.map(c => ({ text: '变成' + COLOR_NAMES[c] + '色', cls: 'btn-soft', dot: COLOR_DOTS[c], fn: () => this._fireBottle(from, c) }));
    modalBox('<div class="mb-title">变成哪种颜色？</div>', btns.concat([{ text: '取消', cls: 'btn-ghost' }]));
  },

  async _fireBottle(from, to) {
    const s = Meta.get();
    if ((s.items.colorBottle || 0) <= 0) return;
    s.items.colorBottle--; Meta.persist();
    this.busy = true;
    this.input.setLocked(true);
    try {
      this.movesUsed++;   // 变色瓶也算一回合
      const ir = this.battle.useItemCombat('colorBottle', null, { from, to });
      await this._resolveItemCombat(ir);
    } finally {
      this.busy = false;
      if (this.input) this.input.setLocked(false);
    }
  },

  async onPickCell(r, c) {
    if (!this.pickMode) return;
    const item = this.pickMode.item;
    this.pickMode = null;
    this.renderer.setHighlight(null);
    const s = Meta.get();
    if ((s.items[item] || 0) <= 0) return;
    s.items[item]--; Meta.persist();
    this.busy = true;
    this.input.setLocked(true);
    try {
      this.movesUsed++;   // 锤子/十字炸弹也算一回合
      const ir = this.battle.useItemCombat(item, { r, c });
      await this._resolveItemCombat(ir);
    } finally {
      this.busy = false;
      if (this.input) this.input.setLocked(false);
    }
  },

  /** 输出型道具结算：播放消除动画 → 计入目标 → 伤害飘字 → 敌人回合演出 → 胜负 */
  async _resolveItemCombat(ir) {
    ir = ir || { events: [], score: 0, matchedCounts: {}, damage: 0 };
    await this.renderer.playEvents(ir.events || []);
    this._accProgress(ir);
    if (ir.damage > 0) {
      Sfx.play('hit');
      this.renderer.floatText('-' + ir.damage, this.renderer.cssW / 2, 30, 'dmg');
      this.renderer.shake();
      Scenes.refreshEnemies(this.battle.targetIdx);
    }
    if (!this.battle.state.over) this._checkGoal();
    if (!this.battle.state.over) await this._processTurn();
    this.refreshBattleHUD();
    if (this.battle.state.over) this._endBattle();
    else if (this.level.steps > 0 && this.stepsLeft <= 0) this._fail('步数用完啦！');
  },

  _allCells() {
    const out = [];
    for (let r = 0; r < this.board.rows; r++) for (let c = 0; c < this.board.cols; c++) out.push({ r, c });
    return out;
  },

  // ============ HUD ============
  refreshBattleHUD() {
    if (!this.battle || !this.level) return;
    const b = this.battle;
    // 步数
    const st = document.getElementById('btSteps');
    if (st) st.textContent = this.level.steps > 0 ? `👟 ${this.stepsLeft}` : '👟 ∞';
    // V5：回合数（每次交换/技能/道具 = 1 回合）
    const tn = document.getElementById('btTurn');
    if (tn) tn.textContent = `🔁 回合 ${this.movesUsed + 1}`;
    // 目标进度
    const g = document.getElementById('btGoal');
    if (g) {
      const goal = this.level.goal || {};
      const show = (t) => { g.innerHTML = `<span class="bt-goaltext">${t}</span>`; };
      if (goal.kind === 'enemy') {
        const es = b.state.enemies.filter(e => e.hp > 0).length;
        show(`👹 剩余敌人 ${es}`);
      } else if (goal.kind === 'combo') {
        show('🎯 ' + goalText(this.level));
      } else {
        const { count } = this._goalDone(goal);
        const gt = goalText(this.level);
        show(`🎯 ${gt}${/^\d/.test(String(count)) ? '' : ''} <b>${count}</b>`);
      }
    }
    // 玩家成员血条
    const members = b.state.members || [];
    document.querySelectorAll('#btMembers .member-card').forEach((card, i) => {
      const m = members[i];
      if (!m) return;
      const bar = card.querySelector('.mc-bar i');
      const txt = card.querySelector('.mc-hp');
      if (bar) bar.style.width = Math.max(0, m.hp / Math.max(1, m.maxHp) * 100) + '%';
      if (txt) txt.textContent = `${m.hp}/${m.maxHp}`;
      card.classList.toggle('fainted', !!m.fainted);
    });
    // 护盾提示（数量 + 最高减伤%）
    const shields = b.state.shields || [];
    if (shields.length > 0) {
      const best = Math.round(Math.max(...shields) * 100);
      const label = `🛡×${shields.length} ${best}%`;
      const mw = document.getElementById('btMembers');
      let tag = document.getElementById('shieldTag');
      if (mw && !tag) {
        tag = Object.assign(document.createElement('span'), { id: 'shieldTag', className: 'shield-tag', textContent: label });
        mw.appendChild(tag);
      } else if (tag) tag.textContent = label;
    } else {
      const tag = document.getElementById('shieldTag');
      if (tag) tag.remove();
    }
    // 技能 CD
    document.querySelectorAll('#btSkills .skill-btn').forEach((btn, i) => {
      const ch = this.team[i];
      if (!ch) return;
      const cd = b.state.skillCds[ch.id] || 0;
      const mask = btn.querySelector('.cd-mask');
      const num = btn.querySelector('.cd-num');
      if (mask && num) {
        mask.style.display = cd > 0 ? '' : 'none';
        num.style.display = cd > 0 ? '' : 'none';
        num.textContent = cd;
      }
    });
    // 道具数量
    for (const k of this.broughtItems) {
      const n = document.getElementById('itemN_' + k);
      if (n) n.textContent = '×' + (Meta.get().items[k] || 0);
    }
  },

  // ============ 计时（timed 关） ============
  _startTimer() {
    clearInterval(this.timerId);
    const goal = this.level.goal || {};
    const hasTime = goal.time != null || this.battle.timeLeft != null;
    const tEl = document.getElementById('btTimer');
    if (!hasTime || !tEl) { if (tEl) tEl.style.display = 'none'; return; }
    if (this.battle.timeLeft == null) this.battle.timeLeft = goal.time || 60;
    tEl.style.display = '';
    const total = goal.time || 60;
    this.timerId = setInterval(() => {
      if (!this.battle || this.battle.state.over) { clearInterval(this.timerId); return; }
      this.battle.timeLeft = Math.max(0, this.battle.timeLeft - 1);
      const left = this.battle.timeLeft;
      tEl.textContent = `⏳ ${left}s`;
      tEl.classList.toggle('urgent', left <= 5);
      if (left <= 5) this.renderer.shake();
      if (left <= 0) {
        clearInterval(this.timerId);
        this._fail(`时间到！${this._goalDone(goal).ok ? '' : '就差一点点…'}`);
      }
    }, 1000);
  },

  // ============ 结算 ============
  _endBattle() {
    clearInterval(this.timerId);
    const b = this.battle;
    if (!b.state.win) { this._fail(); return; }

    // ===== 无尽模式：不进结算页，回血后直接下一波 =====
    if (this.endless) {
      const wave = this.endless.wave;
      this.endless.membersHp = {};
      for (const m of b.state.members) this.endless.membersHp[m.id] = m.hp;
      const gold = 30 + wave * 5;
      this.endless.goldEarned += gold;
      Meta.addGold(gold);
      const s = Meta.get();
      const best = Math.max(wave, s.progress.endlessBest || 0);
      s.progress.endlessBest = best;
      Meta.persist();
      Sfx.jingle('victory');
      toast(`🏆 第 ${wave} 波通关！（最佳 ${best} 波）+${gold} 金币，回复 20% 血量`, 1800);
      setTimeout(() => { if (this.endless) this._nextWave(); }, 1000);
      return;
    }

    this._stopAuto();
    const stars = b.stars();
    const result = Meta.completeLevel(this.level.id, stars, { steps: this.movesUsed, highRisk: this.highRisk });
    this.result = {
      win: true, stars,
      rewards: result.rewards,
      levelUps: result.levelUps,
      unlocks: result.unlocks,
      chapterBox: result.chapterBox,
    };
    if (result.unlocks.length) {
      const d = CHARACTERS.find(c => c.id === result.unlocks[0]);
      if (d) toast(`🎉 ${d.name} 解锁！`);
    }
    Bgm.stop();   // V5：胜利停 BGM，让胜利旋律独奏
    Sfx.jingle('victory');
    if (result.levelUps && Object.keys(result.levelUps).length) Sfx.play('levelup');
    this.renderer.detach();   // V5：胜利后停掉 60fps 渲染循环（下局 startBattle 会重新 attach）
    setTimeout(() => Scenes.show('result'), 600);
  },

  _fail(msg) {
    this._stopAuto();
    clearInterval(this.timerId);

    // ===== 无尽模式：记录最佳波数，进结算页 =====
    if (this.endless) {
      const s = Meta.get();
      const wave = this.endless.wave;
      const best = Math.max(wave, s.progress.endlessBest || 0);
      s.progress.endlessBest = best;
      Meta.persist();
      Bgm.stop();
      Sfx.jingle('defeat');
      this.result = {
        win: false, stars: 0, endless: { wave, best, goldEarned: this.endless.goldEarned },
        diff: `坚持到了第 ${wave} 波！历史最佳 ${best} 波，合计赚了 ${this.endless.goldEarned} 金币`,
        rewards: { gold: 0, candy: { small: 0 }, shards: {} }, levelUps: {}, unlocks: [],
      };
      setTimeout(() => Scenes.show('result'), 600);
      return;
    }

    Meta.failLevel(this.level.id);
    const goal = this.level.goal || {};
    let diff = msg || '别灰心，再来一次！';
    if (goal.kind === 'score' || goal.kind === 'timed') {
      diff = `差 ${Math.max(1, goal.score - this.progress.score)} 分就能通关！`;
    } else if (goal.kind === 'collect') {
      if (Array.isArray(goal.list)) {
        const p = goal.list.find(x => (this.progress.matchedCounts[x.color] || 0) < x.count);
        if (p) diff = `再消除 ${p.count - (this.progress.matchedCounts[p.color] || 0)} 个${COLOR_NAMES[p.color]}色方块就能获胜！`;
      } else if (goal.color != null) {
        diff = `再消除 ${Math.max(1, goal.count - (this.progress.matchedCounts[goal.color] || 0))} 个${COLOR_NAMES[goal.color]}色方块就能获胜！`;
      }
    }
    this.result = { win: false, stars: 0, diff, rewards: { gold: 0, candy: { small: 0 }, shards: {} }, levelUps: {}, unlocks: [] };
    Bgm.stop();   // V5：失败停 BGM
    Sfx.jingle('defeat');
    this.renderer.detach();   // V5：失败后停掉渲染循环
    setTimeout(() => Scenes.show('result'), 600);
  },

  quitBattle() {
    this._stopAuto();
    clearInterval(this.timerId);
    this.renderer.setFog(false);
    this.renderer.setRowLocks([]);
    this.renderer.detach();
    if (!this.endless) Meta.failLevel(this.level.id);
    this.endless = null;
    Scenes.show('map');
  },

  // ============ 自动战斗：自动释放就绪技能 + 自动消除（可开关）============
  toggleAuto() {
    this.auto = !this.auto;
    const btn = document.getElementById('btAuto');
    if (btn) { btn.classList.toggle('on', this.auto); btn.textContent = this.auto ? '⚡自动:开' : '⚡自动:关'; }
    if (this.auto) {
      Sfx.play('button');
      toast('🤖 自动战斗开启：自动放技能 + 自动消除');
      this._autoStep();
    } else {
      if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = 0; }
      toast('🤖 自动战斗已关闭');
    }
  },

  async _autoStep() {
    if (!this.auto) return;
    if (Scenes.current !== 'battle') { this._stopAuto(); return; }
    if (!this.battle) { this._autoTimer = setTimeout(() => this._autoStep(), 220); return; }
    if (this.battle.state.over) {
      // 无尽模式波间过渡：等下一波；其余情况停止
      if (this.endless) { this._autoTimer = setTimeout(() => this._autoStep(), 320); return; }
      this._stopAuto(); return;
    }
    // 有弹窗/正在结算/选目标时暂停自动
    if (this.busy || this.pickMode || document.querySelector('#modal-root .modal-mask')) {
      this._autoTimer = setTimeout(() => this._autoStep(), 220); return;
    }
    // 1) 优先释放就绪的主动技能
    let acted = false;
    for (let i = 0; i < this.team.length; i++) {
      const ch = this.team[i];
      const m = (this.battle.state.members || [])[i];
      if ((m && m.fainted) || (this.battle.state.skillCds[ch.id] || 0) > 0) continue;
      await this.useSkill(i);
      acted = true;
      break;
    }
    // 2) 无技能就绪 → 用提示自动消除一步
    if (!acted && this.battle && !this.battle.state.over && !this.busy) {
      const hint = this.board.useHint();
      if (hint) await this.doSwap(hint.r1, hint.c1, hint.r2, hint.c2);
      else {
        const r = this.board.shuffleAll();
        await this.renderer.playEvents((r && r.events) || []);
        toast('没有可消除的组合，自动洗牌！');
      }
    }
    if (this.auto) this._autoTimer = setTimeout(() => this._autoStep(), 320);
  },

  _stopAuto() {
    this.auto = false;
    if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = 0; }
    const btn = document.getElementById('btAuto');
    if (btn) { btn.classList.remove('on'); btn.textContent = '⚡自动:关'; }
  },

  // ============================================================
  // 无尽模式：波次无限爬塔，敌人逐波变强，波间回复 20% HP
  // ============================================================
  startEndless() {
    const s = Meta.get();
    const teamIds = (s.team || []).filter(Boolean);
    if (!teamIds.length) { toast('先去编队带上梗灵！'); return; }
    this.endless = { wave: 0, membersHp: null, goldEarned: 0 };
    this._nextWave();
  },

  /** 第 wave 波的关卡配置（程序化生成，强度随波数爬升） */
  _endlessLevel(wave) {
    const colors = Math.min(6, 4 + Math.floor(wave / 4));
    const hp = Math.round(1200 * Math.pow(wave, 1.35) + 600);
    const atk = Math.round(80 + wave * 20);
    const boss = wave % 5 === 0;
    const traits = ['shell', 'tornado', 'bet', 'rockfall', 'noise', 'allin'];
    return {
      id: 9000 + wave, chapter: 0, name: `无尽模式 · 第${wave}波`, type: 'enemy',
      goal: { kind: 'enemy' },
      steps: 16 + Math.min(14, wave), colors,
      enemies: boss
        ? [{ name: `无尽Boss · 第${wave}波`, hp: Math.round(hp * 2), atk: Math.round(atk * 1.4), atkEvery: 1, trait: traits[wave % traits.length], traitEvery: 3 }]
        : [{ name: `梗影 · 第${wave}波`, hp, atk, atkEvery: 1 }],
      board: { ice: [], chain: [], echo: [], silent: [] },
      rewards: { gold: 0 }, power: Math.round(hp / 4),
    };
  },

  /** 进入下一波（血量继承 + 波间回复 20%） */
  _nextWave() {
    const wave = ++this.endless.wave;
    const s = Meta.get();
    this.startBattle(this._endlessLevel(wave), s.team, [], { decided: true, endless: true });
    if (this.endless.membersHp) {
      for (const m of this.battle.state.members) {
        const prev = this.endless.membersHp[m.id];
        if (prev != null && prev > 0) m.hp = Math.min(m.maxHp, Math.round(prev * 1.2));
      }
      this.battle.state.hp = this.battle.state.members.reduce((a, m) => a + m.hp, 0);
    }
    this.refreshBattleHUD();
  },
};

// ============ 启动 ============
window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
});
window.addEventListener('DOMContentLoaded', () => {
  Game.start();
});
export default Game;
