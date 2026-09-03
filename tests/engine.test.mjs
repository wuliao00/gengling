// 三消引擎单元测试：node tests/engine.test.mjs（node:assert，种子固定可重复）
import assert from 'node:assert/strict';
import { Board } from '../js/core/board.js';
import { RNG } from '../js/core/rng.js';

// ---------- 测试辅助 ----------

// 基础花纹 (r+2c)%4：任意相邻格颜色都不同，绝不形成 3 连，便于在棋盘上做定点改造。
function craft(board, overrides = {}) {
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) {
    const cell = board.grid[r][c];
    cell.color = (r + 2 * c) % 4;
    cell.special = null;
  }
  for (const [key, color] of Object.entries(overrides)) {
    const [r, c] = key.split(',').map(Number);
    board.grid[r][c].color = color;
  }
}

// 棋盘上仍存在的 >=3 连（chain 格不算）
function runsOf(board) {
  const out = [];
  const ok = cell => cell && cell.chain === 0;
  for (let r = 0; r < board.rows; r++) {
    let c = 0;
    while (c < board.cols) {
      const cell = board.grid[r][c];
      if (!ok(cell)) { c++; continue; }
      let c2 = c + 1;
      while (c2 < board.cols) {
        const n = board.grid[r][c2];
        if (ok(n) && n.color === cell.color) c2++; else break;
      }
      if (c2 - c >= 3) out.push({ r, c, horiz: true, len: c2 - c });
      c = c2;
    }
  }
  for (let c = 0; c < board.cols; c++) {
    let r = 0;
    while (r < board.rows) {
      const cell = board.grid[r][c];
      if (!ok(cell)) { r++; continue; }
      let r2 = r + 1;
      while (r2 < board.rows) {
        const n = board.grid[r2][c];
        if (ok(n) && n.color === cell.color) r2++; else break;
      }
      if (r2 - r >= 3) out.push({ r, c, horiz: false, len: r2 - r });
      r = r2;
    }
  }
  return out;
}

function snapshot(board) {
  return JSON.stringify(board.grid.map(row => row.map(c =>
    c && { color: c.color, special: c.special, ice: c.ice, chain: c.chain })));
}

function assertFullNoHoles(board) {
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) {
    assert.ok(board.grid[r][c], `空洞 (${r},${c})`);
  }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------- 用例 ----------

test('同种子两次构建棋盘完全一致（可重复）', () => {
  const b1 = new Board({ seed: 42 });
  const b2 = new Board({ seed: 42 });
  assert.equal(snapshot(b1), snapshot(b2));
  assert.ok(b1.rng instanceof RNG);
});

test('初始棋盘无匹配、无特殊方块、满格', () => {
  const b = new Board({ seed: 7 });
  assert.deepEqual(runsOf(b), []);
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    const cell = b.grid[r][c];
    assert.ok(cell);
    assert.equal(cell.special, null);
    assert.ok(cell.color >= 0 && cell.color < b.colors);
  }
});

test('非法交换返回 null 且棋盘不变（不相邻/越界/chain锁/无效果）', () => {
  const b = new Board({ seed: 7, seedCells: { chain: [{ r: 4, c: 4, hits: 3 }] } });
  craft(b);
  const before = snapshot(b);
  assert.equal(b.swap(0, 0, 0, 2), null);   // 不相邻
  assert.equal(b.swap(0, 0, 2, 0), null);   // 不相邻
  assert.equal(b.swap(0, 0, -1, 0), null);  // 越界
  assert.equal(b.swap(4, 4, 4, 5), null);   // chain 格不可交换
  assert.equal(b.swap(4, 5, 4, 4), null);   // 与 chain 格交换同样非法
  assert.equal(b.swap(4, 4, 3, 4), null);
  // 无匹配且无特殊效果的交换
  assert.equal(b.swap(0, 0, 0, 1), null);
  assert.equal(snapshot(b), before);        // 棋盘完全不变
});

test('3 消：得分 30 与 matchedCounts 正确', () => {
  const b = new Board({ seed: 7 });
  craft(b, { '7,2': 1, '7,3': 3, '6,3': 1 }); // 第7行 (7,1)(7,2)=1，交换后 (7,3)=1 成 3 连
  assert.deepEqual(runsOf(b), []);
  const res = b.swap(7, 3, 6, 3);
  assert.ok(res, '合法交换应返回 MoveResult');
  const matchEvents = res.events.filter(e => e.type === 'match');
  assert.ok(matchEvents.length >= 1);
  assert.equal(matchEvents[0].cells.length, 3);
  assert.equal(matchEvents[0].chainIndex, 0);
  assert.equal(matchEvents[0].score, 30); // 3 x 10 x (1+0.2x0)
  assert.equal(res.score, matchEvents.reduce((s, e) => s + e.score, 0));
  assert.ok(res.score >= 30);
  assert.ok((res.matchedCounts[1] || 0) >= 3);
  assert.ok(res.events.some(e => e.type === 'fall'));
  assert.ok(res.events.some(e => e.type === 'refill'));
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('横 4 连生成 colBomb', () => {
  const b = new Board({ seed: 7 });
  craft(b, { '7,1': 2, '7,2': 2, '7,4': 2, '6,4': 1, '6,3': 2 });
  assert.deepEqual(runsOf(b), []);
  const res = b.swap(7, 3, 6, 3); // (7,3)=2 后第 7 行 cols1-4 成横 4 连
  assert.ok(res);
  const spawns = res.events.filter(e => e.type === 'specialSpawn');
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].kind, 'colBomb');
  assert.equal(spawns[0].r, 7);
  assert.equal(spawns[0].c, 3);
  assert.ok((res.matchedCounts[2] || 0) >= 3);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('5 连生成 rainbow', () => {
  const b = new Board({ seed: 7 });
  craft(b, { '7,1': 2, '7,2': 2, '7,4': 2, '7,5': 2, '6,4': 1, '6,3': 2 });
  assert.deepEqual(runsOf(b), []);
  const res = b.swap(7, 3, 6, 3); // 第 7 行 cols1-5 成 5 连
  assert.ok(res);
  const spawns = res.events.filter(e => e.type === 'specialSpawn');
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].kind, 'rainbow');
  assert.equal(spawns[0].r, 7);
  assert.ok(spawns[0].c >= 1 && spawns[0].c <= 5);
  assert.ok((res.matchedCounts[2] || 0) >= 4);
  assertFullNoHoles(b);
});

test('连锁：gravity 补位后二次匹配，events 含多个 chainIndex', () => {
  const b = new Board({ seed: 7 });
  craft(b, { '5,2': 3, '6,2': 1, '7,2': 1, '5,3': 1, '7,1': 0, '7,3': 0 });
  assert.deepEqual(runsOf(b), []);
  const res = b.swap(5, 2, 5, 3);
  assert.ok(res);
  // 第 0 轮：第 2 列 (5,2)(6,2)(7,2) 竖 3 连清除；
  // 第 1 轮：(4,2)=0 因重力落到 (7,2)，与 (7,1)=0 (7,3)=0 成横 3 连。
  const indexes = res.events.filter(e => e.type === 'match').map(e => e.chainIndex);
  assert.ok(indexes.includes(0), '应有 chainIndex 0');
  assert.ok(indexes.includes(1), '应有 chainIndex 1（连锁）');
  assert.ok(res.moves >= 2);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('掉落后棋盘无空洞无匹配残留（多次随机步后）', () => {
  const b = new Board({ seed: 99, colors: 5 });
  for (let i = 0; i < 20; i++) {
    const hint = b.useHint();
    if (!hint) break;
    const res = b.swap(hint.r1, hint.c1, hint.r2, hint.c2);
    assert.ok(res);
    assertFullNoHoles(b);
    assert.deepEqual(runsOf(b), []);
  }
});

test('冰块：两次波及后破碎（iceBreak hp 1 -> 0）', () => {
  const b = new Board({ seed: 7, seedCells: { ice: [{ r: 4, c: 4, hp: 2 }] } });
  craft(b, { '4,4': 3 });
  assert.equal(b.grid[4][4].ice, 2);
  let res = b.clearCells([{ r: 4, c: 3 }]); // 相邻格被消除 -> ice-1，冰块格保留
  assert.ok(res.events.some(e => e.type === 'iceBreak' && e.r === 4 && e.c === 4 && e.hp === 1));
  assert.equal(b.grid[4][4].ice, 1);
  assert.ok(b.grid[4][4]);
  res = b.clearCells([{ r: 4, c: 4 }]); // 本格参与消除 -> 归零破冰并被消除
  assert.ok(res.events.some(e => e.type === 'iceBreak' && e.r === 4 && e.c === 4 && e.hp === 0));
  assert.equal(b.grid[4][4].ice, 0);
  assert.ok((res.matchedCounts[3] || 0) >= 1);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('锁链：三次相邻消除后解锁（chainOpen），锁链格不可交换不可消除', () => {
  const b = new Board({ seed: 9, seedCells: { chain: [{ r: 4, c: 4, hits: 3 }] } });
  craft(b);
  const chainColor = b.grid[4][4].color;
  assert.equal(b.swap(4, 4, 4, 5), null);
  let res = b.clearCells([{ r: 3, c: 4 }]); // 上邻
  assert.ok(res.events.every(e => e.type !== 'chainOpen'));
  assert.equal(b.grid[4][4].chain, 2);
  assert.ok(b.grid[4][4]); // 锁链格未被消除
  res = b.clearCells([{ r: 4, c: 3 }]); // 左邻
  assert.equal(b.grid[4][4].chain, 1);
  res = b.clearCells([{ r: 4, c: 5 }]); // 右邻 -> 归零解锁
  assert.ok(res.events.some(e => e.type === 'chainOpen' && e.r === 4 && e.c === 4));
  assert.equal(b.grid[4][4].chain, 0);
  assert.equal(b.grid[4][4].color, chainColor); // 解锁后方块保留
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('clearRow：事件完整（match+fall+refill），整行 8 格消除，棋盘满格无残留', () => {
  const b = new Board({ seed: 11 });
  const res = b.clearRow(3);
  assert.ok(Array.isArray(res.events) && res.events.length > 0);
  const matchEvents = res.events.filter(e => e.type === 'match');
  assert.ok(matchEvents.length >= 1);
  assert.equal(matchEvents[0].cells.length, 8);
  assert.equal(matchEvents[0].score, 80);
  assert.ok(res.events.some(e => e.type === 'fall'));
  assert.ok(res.events.some(e => e.type === 'refill'));
  assert.ok(res.score >= 80);
  const total = Object.values(res.matchedCounts).reduce((s, v) => s + v, 0);
  assert.ok(total >= 8);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('clearCol / clearArea：消除数量与事件正确', () => {
  const b1 = new Board({ seed: 21 });
  const r1 = b1.clearCol(2);
  assert.equal(r1.events.filter(e => e.type === 'match')[0].cells.length, 8);
  assertFullNoHoles(b1);
  assert.deepEqual(runsOf(b1), []);

  const b2 = new Board({ seed: 12 });
  const r2 = b2.clearArea(4, 4, 1); // 3x3
  assert.equal(r2.events.filter(e => e.type === 'match')[0].cells.length, 9);
  assert.equal(r2.events.filter(e => e.type === 'match')[0].score, 90);
  assertFullNoHoles(b2);
  assert.deepEqual(runsOf(b2), []);
});

test('convertColor：全场变色触发连锁，事件完整棋盘满格', () => {
  const b = new Board({ seed: 13 });
  craft(b, { '4,3': 1, '4,5': 0, '4,6': 2 }); // (4,4)(4,5)=0 变 1 后与 (4,3)=1 成 3 连
  assert.deepEqual(runsOf(b), []);
  const res = b.convertColor(0, 1);
  assert.ok(Array.isArray(res.events) && res.events.length > 0);
  assert.ok(res.events.some(e => e.type === 'match'));
  assert.ok(res.score > 0);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('shuffleAll：颜色多重集不变，洗后无匹配', () => {
  const b = new Board({ seed: 14 });
  const colorsOf = () => {
    const arr = [];
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
      if (b.grid[r][c].chain === 0) arr.push(b.grid[r][c].color);
    }
    return arr.sort((x, y) => x - y);
  };
  const before = colorsOf();
  const res = b.shuffleAll();
  assert.ok(Array.isArray(res.events));
  assert.deepEqual(colorsOf(), before);
  assert.deepEqual(runsOf(b), []);
  assertFullNoHoles(b);
});

test('randomCells：返回 n 个互不相同、非特殊的格子', () => {
  const b = new Board({ seed: 15 });
  const cells = b.randomCells(5);
  assert.equal(cells.length, 5);
  const keys = new Set();
  for (const p of cells) {
    assert.ok(b._in(p.r, p.c));
    keys.add(`${p.r},${p.c}`);
    assert.equal(b.grid[p.r][p.c].special, null);
  }
  assert.equal(keys.size, 5);
  assert.equal(b.randomCells(0).length, 0);
});

test('useHint：返回可行交换且执行有效', () => {
  const b = new Board({ seed: 16 });
  const hint = b.useHint();
  assert.ok(hint, '正常棋盘应有可行步');
  assert.ok(Math.abs(hint.r1 - hint.r2) + Math.abs(hint.c1 - hint.c2) === 1);
  const res = b.swap(hint.r1, hint.c1, hint.r2, hint.c2);
  assert.ok(res, 'useHint 给出的交换必须合法');
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('彩虹球交换：清空同色 16 格 + 自身，rainbow 事件与 matchedCounts 正确', () => {
  const b = new Board({ seed: 17 });
  craft(b);
  b.grid[4][4].special = 'rainbow';
  b.grid[4][4].color = 6;
  const res = b.swap(4, 4, 4, 5); // (4,5)=2，彩虹清全场所有 2 号色
  assert.ok(res);
  assert.equal(res.events[0].type, 'swap');
  const rb = res.events.filter(e => e.type === 'rainbow');
  assert.equal(rb.length, 1);
  assert.equal(rb[0].color, 2);
  assert.ok((res.matchedCounts[2] || 0) >= 16);
  assert.equal(res.matchedCounts[6], 1); // 彩虹球自身
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('炸弹随匹配引爆：rowBomb 清整行并产生 bomb 事件', () => {
  const b = new Board({ seed: 18 });
  craft(b, { '4,3': 3, '4,5': 3 });
  b.grid[3][4].color = 3;
  b.grid[3][4].special = 'rowBomb';
  assert.deepEqual(runsOf(b), []);
  const res = b.swap(3, 4, 4, 4); // 炸弹换入 (4,4)，与 (4,3)(4,5) 成 3 连并引爆整行
  assert.ok(res);
  const bombs = res.events.filter(e => e.type === 'bomb');
  assert.equal(bombs.length, 1);
  assert.equal(bombs[0].kind, 'rowBomb');
  assert.equal(bombs[0].r, 4);
  assert.equal(bombs[0].cleared.length, 8);
  assert.ok((res.matchedCounts[3] || 0) >= 3);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

// ---------- V2.1 新增用例（float / treasure / sub / applyWind）----------

test('float 浮空格：重力悬空固定，被消除发 floatDrop', () => {
  // A: 下方支撑被消除后，float 格原地悬空不下落
  const b = new Board({ seed: 30, seedCells: { float: [{ r: 4, c: 4 }] } });
  craft(b);
  assert.equal(b.grid[4][4].float, true);
  const floatCell = b.grid[4][4];
  b.clearCells([{ r: 5, c: 4 }, { r: 6, c: 4 }]);
  assert.ok(b.grid[4][4] === floatCell, 'float 格应悬空固定不下落');
  assert.equal(b.grid[4][4].color, 0);
  assertFullNoHoles(b);

  // B: float 格可正常参与匹配，被消除时发 floatDrop
  const b2 = new Board({ seed: 31 });
  craft(b2, { '6,3': 3 });
  b2.grid[7][4].float = true;
  assert.deepEqual(runsOf(b2), []);
  const res = b2.swap(7, 3, 6, 3); // 第 7 行 (7,2)(7,3)(7,4) 成 3 连，(7,4) 为 float
  assert.ok(res, 'float 格可正常参与匹配交换');
  const drops = res.events.filter(e => e.type === 'floatDrop');
  assert.equal(drops.length, 1);
  assert.equal(drops[0].r, 7);
  assert.equal(drops[0].c, 4);
  assert.ok((res.matchedCounts[3] || 0) >= 3);
  assertFullNoHoles(b2);
  assert.ok(!b2.grid[7][4].float, '补充的新格不应带 float 标记');
  assert.deepEqual(runsOf(b2), []);
});

test('treasure 宝箱：普通颜色格+标记，被炸弹波及消除时发 treasure 事件', () => {
  const b = new Board({ seed: 18, seedCells: { treasure: [{ r: 4, c: 0 }] } });
  craft(b, { '4,3': 3, '4,5': 3 });
  b.grid[3][4].color = 3;
  b.grid[3][4].special = 'rowBomb';
  assert.equal(b.grid[4][0].treasure, true);
  assert.equal(b.grid[4][0].special, null);
  const res = b.swap(3, 4, 4, 4); // 3 连引爆 rowBomb 清整行，波及 (4,0) 宝箱
  assert.ok(res);
  const tv = res.events.filter(e => e.type === 'treasure');
  assert.equal(tv.length, 1);
  assert.equal(tv[0].r, 4);
  assert.equal(tv[0].c, 0);
  assert.ok((res.matchedCounts[0] || 0) >= 1, '宝箱按普通颜色格计入 matchedCounts');
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('sub 通配：sub+两同色横排可消除，matchedCounts 记主色', () => {
  const b = new Board({ seed: 7 });
  craft(b, { '7,1': 2, '7,2': 1, '6,4': 1 });
  b.grid[7][3].sub = true;
  b.grid[7][3].color = -1;
  assert.deepEqual(runsOf(b), []);
  const res = b.swap(7, 4, 6, 4); // (7,4) 换入 1 后第 7 行 [1, sub, 1] 成 3 连
  assert.ok(res, 'sub 应充当任意颜色参与匹配');
  const me = res.events.find(e => e.type === 'match' && e.cells.some(p => p.r === 7 && p.c === 3));
  assert.ok(me, 'match 事件应包含 sub 格');
  assert.equal(me.cells.find(p => p.r === 7 && p.c === 3).color, 1, '事件里 sub 格 color 用主色');
  assert.ok((res.matchedCounts[1] || 0) >= 3);
  assert.equal(res.matchedCounts[-1], undefined, 'sub 不应以 -1 计数');
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('sub 通配：sub+单色格+sub 竖排成 3 连', () => {
  const b = new Board({ seed: 7 });
  craft(b);
  b.grid[4][0].sub = true; b.grid[4][0].color = -1;
  b.grid[6][0].sub = true; b.grid[6][0].color = -1;
  b.grid[5][0].color = 2; // [sub, 2, sub] 引擎视为竖 3 连
  assert.equal(b._groups().length, 1, '引擎视角应存在一个匹配组');
  const res = b.clearCells([{ r: 7, c: 7 }]); // 任一消除触发管线，预存匹配一并结算
  const me = res.events.find(e => e.type === 'match' && e.cells.some(p => p.r === 5 && p.c === 0));
  assert.ok(me, '预存的 sub 竖 3 连应被结算');
  for (const r of [4, 6]) {
    assert.equal(me.cells.find(p => p.r === r && p.c === 0).color, 2, 'sub 格 color 记主色');
  }
  assert.ok((res.matchedCounts[2] || 0) >= 3);
  assert.equal(res.matchedCounts[-1], undefined);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('sub 通配：sub 格交换性（能成匹配则合法，否则 null）', () => {
  const b = new Board({ seed: 7 });
  craft(b, { '5,0': 0 });
  b.grid[7][0].sub = true;
  b.grid[7][0].color = -1;
  assert.deepEqual(runsOf(b), []);
  // 换后不成任何 3 连 -> 非法
  assert.equal(b.swap(7, 0, 7, 1), null, 'sub 交换后无匹配应返回 null');
  // 换后 col0 = [0, 0, sub] 成 3 连 -> 合法
  const res = b.swap(7, 0, 6, 0);
  assert.ok(res, 'sub 交换后成匹配应合法');
  const me = res.events.find(e => e.type === 'match' && e.cells.some(p => p.r === 6 && p.c === 0));
  assert.ok(me);
  assert.equal(me.cells.find(p => p.r === 6 && p.c === 0).color, 0);
  assert.ok((res.matchedCounts[0] || 0) >= 3);
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

test('applyWind：随机 1 列顶部 3 格被吹走，走重力补充，事件含 wind', () => {
  const b = new Board({ seed: 40 });
  craft(b);
  const topBefore = [];
  for (let c = 0; c < b.cols; c++) topBefore.push([0, 1, 2].map(r => b.grid[r][c].color));
  const res = b.applyWind(3);
  const wind = res.events.find(e => e.type === 'wind');
  assert.ok(wind, '事件应含 {type:"wind"}');
  assert.ok(Number.isInteger(wind.col) && wind.col >= 0 && wind.col < b.cols);
  assert.equal(wind.cleared.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(wind.cleared[i].r, i);
    assert.equal(wind.cleared[i].c, wind.col);
    assert.equal(wind.cleared[i].color, topBefore[wind.col][i]);
  }
  assert.ok(res.events.some(e => e.type === 'refill'), '吹走后应补充新格');
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
  // 被吹走的格不计入 matchedCounts、不计分（得分只来自 match 事件）
  assert.equal(res.score, res.events.filter(e => e.type === 'match').reduce((s, e) => s + e.score, 0));

  const b2 = new Board({ seed: 41 });
  craft(b2);
  const res2 = b2.applyWind(); // 默认 n=3
  const wind2 = res2.events.find(e => e.type === 'wind');
  assert.ok(wind2);
  assert.equal(wind2.cleared.length, 3);
  assertFullNoHoles(b2);
});

test('shuffleAll：洗牌后无匹配且 float/treasure/sub 标记随格保留', () => {
  const b = new Board({ seed: 41, seedCells: { float: [{ r: 2, c: 3 }], treasure: [{ r: 5, c: 1 }], sub: [{ r: 3, c: 0 }] } });
  craft(b);
  b.grid[3][0].color = -1;
  const res = b.shuffleAll();
  assert.ok(Array.isArray(res.events));
  assert.equal(b.grid[2][3].float, true);
  assert.equal(b.grid[5][1].treasure, true);
  assert.equal(b.grid[3][0].sub, true);
  assert.equal(b.grid[3][0].color, -1);
  assert.equal(b._groups().length, 0, '洗后引擎视角无即时匹配（含 sub 通配）');
  assertFullNoHoles(b);
});

test('useHint：含 float/treasure/sub 的棋盘仍返回可行交换', () => {
  const b = new Board({ seed: 16, seedCells: { float: [{ r: 2, c: 3 }], treasure: [{ r: 5, c: 1 }], sub: [{ r: 3, c: 0 }] } });
  craft(b);
  b.grid[3][0].color = -1;
  const hint = b.useHint();
  assert.ok(hint, '应返回可行交换');
  const res = b.swap(hint.r1, hint.c1, hint.r2, hint.c2);
  assert.ok(res, '提示交换必须合法');
  assertFullNoHoles(b);
  assert.deepEqual(runsOf(b), []);
});

// ---------- 运行 ----------

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
  }
}
console.log('');
if (failed) {
  console.log(`${failed} test(s) FAILED, ${tests.length - failed} passed`);
  process.exitCode = 1;
} else {
  console.log(`ALL GREEN: ${tests.length} tests passed`);
}
