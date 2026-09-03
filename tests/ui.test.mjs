// ui.test.mjs — jsdom 无头集成冒烟：验证主循环/场景/战斗接线无异常
// 运行：node tests/ui.test.mjs
import { JSDOM } from 'jsdom';
import assert from 'node:assert';

// ===== Canvas 2D 桩（jsdom 无 canvas 实现）=====
function stubCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'string') return t[k] !== undefined ? t[k] : () => {};
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="app">
  <header id="topbar"><b id="tbEnergy"></b><b id="tbGold"></b></header>
  <div class="scene" id="scene-home"></div>
  <div class="scene" id="scene-map"></div>
  <div class="scene" id="scene-lineup"></div>
  <div class="scene" id="scene-battle"><canvas id="board"></canvas></div>
  <div class="scene" id="scene-result"></div>
  <div class="scene" id="scene-chars"></div>
  <div class="scene" id="scene-shop"></div>
</div>
<div id="toast-root"></div><div id="modal-root"></div>
</body></html>`, { url: 'http://localhost/', pretendToBeVisual: true });

global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.getComputedStyle = dom.window.getComputedStyle;
// HTMLCanvasElement.getContext 桩
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this._ctx) this._ctx = stubCtx();
  return this._ctx;
};

const { default: Game } = await import('../js/main.js');
const { Meta } = await import('../js/game/meta.js');
const { Board } = await import('../js/core/board.js');
const { Scenes } = await import('../js/ui/scenes.js');
const { LEVELS } = await import('../js/data/levels.js');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('[PASS]', name); }
  catch (e) { console.log('[FAIL]', name, '—', e.message); process.exitCode = 1; }
}

// 等待微任务/定时器排空
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

// ===== 1. 启动 =====
Meta.init();
Game.start();
await tick(50);
ok('启动进入 home 场景', () => assert.ok(document.getElementById('scene-home').classList.contains('active')));

// ===== 2. 地图场景（世界地图）=====
Scenes.show('map');
await tick(50);
ok('世界地图渲染', () => {
  const node = document.getElementById('scene-map');
  assert.ok(node.innerHTML.length > 100, '地图内容为空');
});

// ===== 3. 编队场景 =====
Scenes._levelId = 1;
Scenes.show('lineup');
await tick(50);
ok('编队场景渲染（成员槽/道具）', () => {
  assert.ok(document.querySelectorAll('#teamSlots .team-slot').length === 3);
  assert.ok(document.querySelectorAll('#itemChecks .item-check').length === 8);
});

// ===== 4. 开战（普通关）=====
Game.startBattle(LEVELS.find(l => l.id === 1), ['hajimiao', null, null], ['hammer']);
await tick(80);
ok('战斗场景渲染（敌人条/成员卡/技能/棋盘）', () => {
  assert.ok(document.getElementById('scene-battle').classList.contains('active'));
  assert.ok(document.querySelectorAll('#btMembers .member-card').length === 1, '成员卡缺失');
  assert.ok(document.querySelectorAll('#btSkills .skill-btn').length === 1, '技能按钮缺失');
});
ok('棋盘满格', () => {
  for (const row of Game.board.grid) for (const c of row) assert.ok(c, '有空格');
});

// ===== 5. 用 useHint 模拟一次有效交换 =====
const hint = Game.board.useHint();
assert.ok(hint, '无可行交换');
await Game.doSwap(hint.r1, hint.c1, hint.r2, hint.c2);
await tick(50);
ok('交换后回合推进（步数减少/无异常）', () => {
  assert.equal(Game.movesUsed, 1);
});

// ===== 6. 技能释放 =====
await Game.useSkill(0);
await tick(50);
ok('技能释放后 CD 生效', () => {
  assert.ok((Game.battle.state.skillCds.hajimiao || 0) > 0);
});

// ===== 7. 气流关（第 37 关）：机制识别 + applyWind =====
Game.renderer.detach();
Game.startBattle(LEVELS.find(l => l.id === 37), ['hajimiao', null, null], []);
await tick(80);
ok('气流关机制识别', () => assert.ok(Game.mech.wind === true));
const h2 = Game.board.useHint();
await Game.doSwap(h2.r1, h2.c1, h2.r2, h2.c2);
await Game.doSwap(...(Object.values(Game.board.useHint())));
await tick(80);
ok('两步后触发气流（棋盘仍满格）', () => {
  assert.equal(Game.movesUsed, 2);
  for (const row of Game.board.grid) for (const c of row) assert.ok(c, '气流后有空格');
});

// ===== 8. 浮空/宝箱/子方块种子 =====
Game.renderer.detach();
Game.startBattle(LEVELS.find(l => l.id === 40), ['hajimiao', null, null], []);
let floatN = 0;
for (const row of Game.board.grid) for (const c of row) if (c.float) floatN++;
ok('浮空关生成浮空格', () => assert.ok(floatN > 0, '无浮空格'));
Game.renderer.detach();
Game.startBattle(LEVELS.find(l => l.id === 46), ['hajimiao', null, null], []);
let treN = 0;
for (const row of Game.board.grid) for (const c of row) if (c.treasure) treN++;
ok('宝箱关生成宝箱格', () => assert.ok(treN > 0, '无宝箱格'));
Game.renderer.detach();
Game.startBattle(LEVELS.find(l => l.id === 59), ['hajimiao', null, null], []);
let subN = 0;
for (const row of Game.board.grid) for (const c of row) if (c.sub) subN++;
ok('子方块关生成通配格', () => assert.ok(subN > 0, '无子方块格'));

// ===== 9. 老虎机关（第 64 关）机制识别 =====
Game.renderer.detach();
Game.startBattle(LEVELS.find(l => l.id === 64), ['hajimiao', null, null], []);
ok('老虎机关机制识别', () => assert.ok(Game.mech.slot === true));

// ===== 10. 赌局关弹窗（第 67 关）=====
const modalBefore = document.querySelectorAll('#modal-root .modal-mask').length;
Game.battle = null; // 清掉上一关残留，验证选择前不开新战斗
Game.startBattle(LEVELS.find(l => l.id === 67), ['hajimiao', null, null], []);
ok('赌局关弹出模式选择', () => {
  assert.ok(document.querySelectorAll('#modal-root .modal-mask').length > modalBefore, '未弹窗');
  assert.ok(!Game.battle, '选择前不应开战');
});

// ===== 11. Boss trait 归一化（第 36 关噪音怪兽 noiseWave→noise）=====
Game.renderer.detach();
document.querySelectorAll('#modal-root .modal-mask').forEach(m => m.remove());
Game.startBattle(LEVELS.find(l => l.id === 36), ['hajimiao', 'dasangwang', 'mianshifu'], []);
ok('Boss trait 归一化（noise）', () => {
  const e = Game.battle.state.enemies[0];
  assert.equal(e.trait, 'noise');
  assert.ok(e.traitEvery >= 2, 'traitEvery 未设置');
});
ok('逐角色 HP：3 成员', () => {
  assert.equal(Game.battle.state.members.length, 3);
  assert.ok(Game.battle.state.members.every(m => m.maxHp > 0));
});
// 模拟多回合验证 Boss 技能触发不抛错（直接打 endTurn）
for (let i = 0; i < 8 && !Game.battle.state.over; i++) {
  const h3 = Game.board.useHint();
  if (h3) await Game.doSwap(h3.r1, h3.c1, h3.r2, h3.c2);
}
await tick(100);
ok('8 回合战斗循环无异常（含 Boss 技能/成员受击）', () => {
  assert.ok(Game.battle.state.turn > 0);
});

// ===== 12. 结算场景 =====
// 强制胜利走结算
Game.battle.state.over = true;
Game.battle.state.win = true;
Game._endBattle();
await tick(800);
ok('结算场景渲染', () => {
  assert.ok(document.getElementById('scene-result').classList.contains('active'));
});

// ===== 13. 改名大狗旺 =====
Game.renderer.detach();
const { CHARACTERS } = await import('../js/data/characters.js');
ok('大嗓汪已改名大狗旺', () => {
  const d = CHARACTERS.find(c => c.id === 'dasangwang');
  assert.equal(d.name, '大狗旺');
});

// ===== 14. 音效模块（jsdom 无 AudioContext，应静默降级不抛错）=====
const { Sfx } = await import('../js/game/sfx.js');
ok('Sfx 无 AudioContext 降级不抛错', () => {
  Sfx.play('match', { step: 2 });
  Sfx.jingle('victory');
  Sfx.setMuted(true);
  Sfx.play('match');
  Sfx.setMuted(false);
});

// ===== 15. 无尽模式 =====
Game.renderer.detach();
Game.endless = null;
Game.startEndless();
await tick(120);
ok('无尽模式进入第 1 波', () => {
  assert.ok(Game.endless && Game.endless.wave === 1);
  assert.ok(document.getElementById('scene-battle').classList.contains('active'));
  assert.equal(Game.level.id, 9001);
  assert.ok(Game.battle.state.members.length >= 1);
});
ok('无尽波次强度递增', () => {
  const l1 = Game._endlessLevel(1), l5 = Game._endlessLevel(5), l9 = Game._endlessLevel(9);
  assert.ok(l5.enemies[0].hp > l1.enemies[0].hp);
  assert.ok(l9.enemies[0].hp > l5.enemies[0].hp);
  assert.ok(l5.enemies[0].name.includes('Boss'), '第5波应是Boss波');
});
// 模拟通过一波 → 自动进入第 2 波且血量继承
Game.battle.state.enemies.forEach(e => e.hp = 0);
Game.battle.state.over = true;
Game.battle.state.win = true;
const hpBefore = Game.battle.state.members.map(m => m.hp);
Game._endBattle();
await tick(1300);
ok('一波通关后自动进入第 2 波（血量继承+回复）', () => {
  assert.equal(Game.endless.wave, 2);
  assert.equal(Game.level.id, 9002);
  // 满血成员会被 maxHp 封顶，用 min(maxHp, 1.2×prev) 校验
  const prev = Game.endless.membersHp || {};
  assert.ok(Game.battle.state.members.every(m => {
    const p = prev[m.id];
    if (p == null) return true;
    return m.hp === Math.min(m.maxHp, Math.round(p * 1.2));
  }));
});

// ===== 16. 第5关 rainbowRed 胜利条件回归（越消越多 bug）=====
Game.renderer.detach();
Game.endless = null;
Game.startBattle(LEVELS.find(l => l.id === 5), ['hajimiao', null, null], []);
ok('第5关目标为 rainbowRed', () => assert.equal(Game.level.goal.kind, 'rainbowRed'));
ok('未用彩虹球前不判胜（即使场上无红方块）', () => {
  const r = Game._goalDone(Game.level.goal);
  assert.equal(r.ok, false);
});
ok('用彩虹球消除红方块后立即判胜（无视补充刷出的新红块）', () => {
  Game.progress.rainbowCleared[0] = 8; // 模拟彩虹球事件清掉 8 个红
  const r = Game._goalDone(Game.level.goal);
  assert.equal(r.ok, true);
  assert.equal(r.count, 8);
});

console.log(process.exitCode ? '\nSOME FAILED' : `\nALL GREEN: ${passed} tests passed`);
setTimeout(() => process.exit(process.exitCode || 0), 50); // 定时器/rAF 不阻塞退出
