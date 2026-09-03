// tests/meta.test.mjs — 元系统测试（node:assert + stub board / 注入随机源）
// 运行：node tests/meta.test.mjs
// 覆盖：存档读写与降级、体力时间回复、升级/升星/碎片保底、completeLevel 发奖与解锁、
//       Battle 完整流程（消除伤害、敌我死亡、护盾、震慑、共鸣、技能CD、胜利/失败/星级、道具）

import assert from 'node:assert/strict';
import { Save } from '../js/game/save.js';
import { Meta, EXP_TABLE, STAR_COSTS, CHAPTER_CHARS } from '../js/game/meta.js';
import { Battle } from '../js/game/battle.js';
import { castSkill } from '../js/game/skills.js';
import { CHARACTERS } from '../js/data/characters.js';

let passed = 0;
function section(name) { console.log('  ▸ ' + name); }
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg + ` (actual=${a}, expected=${b})`); passed++; }

// ========== 测试用关卡 / 章节（内联最小对象）==========
const TEST_LEVELS = [
  { id: 1, chapter: 99, type: 'collect', goal: { kind: 'collect', color: 0, count: 10 }, steps: 15,
    enemies: [], boss: false, unlockChar: null, rewards: { gold: 100, shard: 2, shardChar: 'hajimiao' } },
  { id: 5, chapter: 2, type: 'boss', goal: { kind: 'enemy' }, steps: 20,
    enemies: [{ name: 'Boss史莱姆', hp: 5000, atk: 100, atkEvery: 1, trait: 'none' }],
    boss: true, unlockChar: null, rewards: { gold: 200 } },
  { id: 10, chapter: 99, type: 'collect', goal: { kind: 'collect', color: 1, count: 5 }, steps: 12,
    enemies: [], boss: false, unlockChar: 'dasangwang', rewards: { gold: 50, shard: 1, shardChar: null } }
];
const TEST_CHAPTERS = [];

const BOX_LEVELS = [
  { id: 1, chapter: 1, type: 'collect', goal: { kind: 'collect', color: 0, count: 3 }, steps: 10,
    enemies: [], boss: false, unlockChar: null, rewards: { gold: 50, shard: 1, shardChar: 'hajimiao' } },
  { id: 2, chapter: 1, type: 'collect', goal: { kind: 'collect', color: 1, count: 3 }, steps: 10,
    enemies: [], boss: false, unlockChar: null, rewards: { gold: 50, shard: 1, shardChar: 'hajimiao' } }
];
const BOX_CHAPTERS = [{ id: 1, name: '梗灵觉醒', box: '哈基喵碎片×10、金币×500' }];

function freshMeta(levels = TEST_LEVELS, chapters = TEST_CHAPTERS) {
  Meta.init(Save.default(), levels, chapters);
  return Meta; // Meta 是单例，返回它以便 M.save / M.energy / M.completeLevel 直接访问
}

// ========== stub board（不 import core）==========
function stubBoard() {
  const calls = [];
  const grid = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) row.push({ color: c < 5 ? 0 : 1, special: null, ice: 0, chain: 0 });
    grid.push(row);
  }
  return {
    grid, calls,
    clearCells(cells) { calls.push(['clearCells', cells]); return cells.map(cl => ({ type: 'match', cells: [cl], chainIndex: 0 })); },
    clearRow(r) { calls.push(['clearRow', r]); return [{ type: 'match', cells: Array.from({ length: 8 }, (_, c) => ({ r, c })), chainIndex: 0 }]; },
    clearCol(c) { calls.push(['clearCol', c]); return [{ type: 'match', cells: Array.from({ length: 8 }, (_, r) => ({ r, c })), chainIndex: 0 }]; },
    clearArea(r, c, rad) { calls.push(['clearArea', r, c, rad]); return [{ type: 'match', cells: [{ r, c }], chainIndex: 0 }]; },
    convertColor(from, to) { calls.push(['convertColor', from, to]); return [{ type: 'match', cells: [], chainIndex: 0 }]; },
    shuffleAll() { calls.push(['shuffleAll']); return [{ type: 'fall', moves: [] }]; },
    randomCells(n) { calls.push(['randomCells', n]); return Array.from({ length: n }, (_, i) => ({ r: i % 8, c: Math.floor(i / 8) % 8 })); }
  };
}

// ========== 可注入 rng ==========
function rngSeq(...vals) {
  let i = 0;
  const rng = {
    next() { return i < vals.length ? vals[i++] : 0.99; },
    int(n) { return Math.min(n - 1, Math.floor(rng.next() * n)); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; }
  };
  return rng;
}

// 战斗用角色工厂
function mkChar(id, atk, hp, opts = {}) {
  return Object.assign({
    id, hp, atk, mult: 1.0, skillLv: opts.skillLv || 1,
    skill: opts.skill || { name: '测试技', cd: 4, dmgMult: 2, effect: 'clearRow' },
    passive: opts.passive || { effect: 'none' }
  }, opts.extra || {});
}
function mkLevel(enemies, opts = {}) {
  return Object.assign({ id: 1, type: 'enemy', goal: { kind: 'enemy' }, steps: 20, enemies }, opts);
}
const move3 = (moves = 1, color = 0) => ({
  events: [{ type: 'match', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], chainIndex: 0 }],
  score: 30, matchedCounts: { [color]: 3 }, moves
});

console.log('== 1. 存档读写与降级 ==');
{
  section('内存降级（Node 无 localStorage）+ 读写');
  Save.reset();
  eq(Save.load(), null, '初始无存档');
  ok(Save.save({ gold: 777 }) === true, 'save 返回 true');
  eq(Save.load().gold, 777, '读回 gold');
  Save.reset();
  eq(Save.load(), null, 'reset 后为空');

  section('DEFAULT 结构');
  const d = Save.default();
  eq(d.gold, 500, '默认金币');
  eq(d.energy, 20, '默认体力');
  eq(d.unlockedLevels, 1, '默认解锁关卡');
  eq(Object.keys(d.chars).length, 7, '7 个角色');
  eq(d.chars.hajimiao.unlocked, true, '哈基喵初始解锁');
  eq(d.chars.dasangwang.unlocked, false, '其他角色未解锁');
  eq(d.chars.mianshifu.star, 0, '星级初始 0');
  eq(d.items.hammer, 2, '初始锤子');
  assert.deepEqual(d.team, ['hajimiao', null, null]); passed++;

  section('merge 补全残缺存档');
  const m = Save.merge({ gold: 123 });
  eq(m.gold, 123, '覆盖字段');
  eq(m.items.crossBomb, 1, '缺失字段用默认');
  ok(m.chars.zhuanzhuanjun && m.chars.mianshifu, '角色字段补全');
}

console.log('== 2. 体力：时间戳结算 ==');
{
  const M = freshMeta();
  section('5 分钟回 1 点，上限 30');
  const T0 = 1700000000000;
  M.save.energy = 20; M.save.energyTs = T0;
  M.energy.regen(T0 + 4 * 60000);
  eq(M.save.energy, 20, '不足 5 分钟不回');
  M.energy.regen(T0 + 10 * 60000);
  eq(M.save.energy, 22, '10 分钟回 2 点');
  M.energy.regen(T0 + 1000 * 60000);
  eq(M.save.energy, 30, '上限 30');
  section('cost');
  ok(M.energy.cost(5) === true, '够则扣');
  eq(M.save.energy, 25, '扣后 25');
  ok(M.energy.cost(100) === false, '不够返回 false');
  eq(M.save.energy, 25, '失败不扣');
  section('满级前部分回复只扣对应时间戳');
  M.save.energy = 29; M.save.energyTs = T0;
  M.energy.regen(T0 + 10 * 60000);
  eq(M.save.energy, 30, '29→30 只需 1 点');
}

console.log('== 3. 养成：升级 / 升星 / 解锁 / 战力 ==');
{
  const M = freshMeta();
  section('addExp 升级（EXP_TABLE）');
  eq(EXP_TABLE.length, 29, '经验表 29 级');
  eq(EXP_TABLE[0], 100, '1→2 需 100');
  eq(EXP_TABLE[28], 18000, '29→30 需 18000');
  const ups = M.addExp('hajimiao', 250);
  assert.deepEqual(ups, [2, 3], '连升 2 级'); passed++;
  eq(M.save.chars.hajimiao.level, 3, '等级 3');
  eq(M.save.chars.hajimiao.exp, 0, '经验恰好用完');
  eq(M.save.chars.hajimiao.favorExp, 40, '每级好感 +20');

  section('30 级封顶');
  M.addExp('hajimiao', 1000000);
  eq(M.save.chars.hajimiao.level, 30, '满级 30');
  ok(M.save.chars.hajimiao.exp <= EXP_TABLE[28], '溢出经验封顶');

  section('升星消耗 20/40/60/100');
  const h = M.save.chars.dasangwang;
  ok(M.starUp('dasangwang') === false, '无碎片不能升星');
  M.addShard('dasangwang', 20);
  ok(M.starUp('dasangwang') === true, '20 碎片 0→1 星');
  eq(h.star, 1, 'star 1');
  M.addShard('dasangwang', 19);
  ok(M.starUp('dasangwang') === false, '19 < 40 不够');
  M.addShard('dasangwang', 21);
  ok(M.starUp('dasangwang') === true, '40 碎片 1→2 星');

  section('解锁角色需 30 碎片');
  M.addShard('feitianxia', 29);
  ok(M.unlockChar('feitianxia') === false, '29 碎片不能解锁');
  M.addShard('feitianxia', 1);
  ok(M.unlockChar('feitianxia') === true, '30 碎片解锁');
  eq(M.save.chars.feitianxia.unlocked, true, '已解锁');
  eq(M.save.chars.feitianxia.shards, 0, '碎片被消耗');
  ok(M.unlockChar('feitianxia') === false, '重复解锁 false');

  section('charPower（等级插值 + 星级加成）');
  M.save.chars.hajimiao.level = 1; M.save.chars.hajimiao.star = 0;
  let p = M.charPower('hajimiao');
  assert.deepEqual(p, { hp: 800, atk: 120, mult: 1.0 }); passed++;
  M.save.chars.hajimiao.level = 30; M.save.chars.hajimiao.star = 0;
  p = M.charPower('hajimiao');
  eq(p.hp, 2400, '满级 HP 被 max 截断');
  eq(p.atk, 480, '满级 ATK');
  eq(p.mult, 1.8, '满级倍率');
  M.save.chars.hajimiao.star = 4;
  p = M.charPower('hajimiao');
  eq(p.hp, 3600, '满星 HP +50%');
  eq(p.atk, 720, '满星 ATK +50%');

  section('teamPower = Σ(HP×0.5 + ATK×2 + mult×500)');
  M.save.chars.hajimiao.level = 1; M.save.chars.hajimiao.star = 0;
  M.save.chars.dasangwang.star = 0;
  M.save.team = ['hajimiao', 'dasangwang', null];
  // hajimiao: 800*0.5+120*2+1.0*500 = 1140; dasangwang: 600*0.5+200*2+1.2*500 = 1300
  eq(M.teamPower(), 2440, '队伍战力');
}

console.log('== 4. completeLevel 发奖 / 保底 / 解锁 / 章节宝箱 ==');
{
  section('金币(3星+50%)/糖果/经验/碎片/下一关');
  const M = freshMeta();
  M.rand = () => 0.99; // 确定性：糖果 5 个
  M.save.team = ['hajimiao', 'dasangwang', null];
  const r = M.completeLevel(1, 3, {});
  eq(r.rewards.gold, 150, '100 金币 3 星 ×1.5');
  eq(M.save.gold, 650, '500 + 150');
  eq(r.rewards.candy.small, 5, '小糖果 3-5 取上界');
  eq(M.save.items.candyS, 5, '糖果入库');
  eq(M.save.chars.hajimiao.level, 4, '500 exp → 4 级');
  eq(M.save.chars.dasangwang.level, 4, '队友同样获得经验');
  eq(r.rewards.shards.hajimiao, 2, 'shardChar 指定掉 2');
  eq(M.save.unlockedLevels, 2, '解锁下一关');
  eq(M.save.levelStars[1], 3, '星级记录');

  section('碎片保底：连续 30 关没掉 → 第 31 关必掉');
  const M2 = freshMeta();
  M2.rand = () => 0.99;
  M2.save.team = ['hajimiao', null, null];
  for (let i = 0; i < 30; i++) M2.completeLevel(1, 1, {});
  eq(M2.save.chars.dasangwang.shards, 0, '30 关内未保底');
  eq(M2.save.pity.dasangwang, 30, 'pity 计数 30');
  const r31 = M2.completeLevel(1, 1, {});
  ok(r31.pityForce.includes('dasangwang'), '第 31 关触发保底');
  eq(M2.save.chars.dasangwang.shards, 1, '保底掉 1 碎片');
  eq(M2.save.pity.dasangwang, 0, '保底后清零');

  section('Boss 关掉 3-5 个指定章角色碎片');
  const M3 = freshMeta();
  M3.rand = () => 0.99; // 3 + floor(0.99*3) = 5
  M3.save.team = ['hajimiao', null, null];
  const rb = M3.completeLevel(5, 3, {});
  eq(rb.rewards.shards[CHAPTER_CHARS[2]], 5, '第二章 Boss 掉大狗旺碎片×5');
  eq(rb.rewards.gold, 300, 'Boss 金币 3 星加成');
  eq(M3.save.unlockedLevels, 6, '解锁下一关');
  eq(M3.failLevel(5), 3, 'Boss 失败扣 3 体力');
  eq(M3.failLevel(1), 2, '普通失败扣 2 体力');

  section('关卡解锁角色（unlockChar）');
  const M4 = freshMeta();
  M4.save.team = ['hajimiao', null, null];
  const ru = M4.completeLevel(10, 1, {});
  ok(ru.unlocks.includes('dasangwang'), '解锁列表包含大狗旺');
  eq(M4.save.chars.dasangwang.unlocked, true, '免费直接解锁');

  section('章节全通 → 宝箱提示（仅一次）');
  const M5 = freshMeta(BOX_LEVELS, BOX_CHAPTERS);
  M5.rand = () => 0.5;
  M5.save.team = ['hajimiao', null, null];
  eq(M5.completeLevel(1, 1, {}).chapterBox, null, '未全通无宝箱');
  const box = M5.completeLevel(2, 1, {}).chapterBox;
  ok(box && box.chapter === 1 && /哈基喵碎片/.test(box.box), '全通返回宝箱提示');
  eq(M5.completeLevel(2, 1, {}).chapterBox, null, '宝箱只发一次');
}

console.log('== 5. Battle：消除伤害 / 敌我死亡 / 护盾 / 星级 ==');
{
  section('3 消伤害公式：n×avgATK×0.5×(1+0.15×连锁)');
  const b1 = new Battle(mkLevel([{ name: '史莱姆', hp: 1000, atk: 80, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  const r1 = b1.onMoveResult(move3(1));
  eq(r1.damage, 207, '3×120×0.5×1.15 = 207');
  eq(b1.state.enemies[0].hp, 793, '敌人扣血');
  ok(!b1.state.over, '未结束');
  eq(b1.remainingSteps(), 19, '剩余步数');
  eq(b1.stars(), 3, '剩余 ≥5 → 3 星');

  section('敌人全灭 → 胜利');
  const b2 = new Battle(mkLevel([{ name: '史莱姆', hp: 200, atk: 10, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b2.onMoveResult(move3(1));
  ok(b2.state.over && b2.state.win, '直接判胜');

  section('玩家死亡 → 失败');
  const b3 = new Battle(mkLevel([{ name: '大魔王', hp: 999999, atk: 5000, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b3.onMoveResult(move3(1));
  ok(b3.state.over && !b3.state.win, '战败');
  eq(b3.state.hp, 0, 'HP 归零');

  section('护盾抵消一次攻击');
  const b4 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 80, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b4.state.shield = 1;
  b4.onMoveResult(move3(1));
  eq(b4.state.shield, 0, '护盾消耗');
  eq(b4.state.hp, 800, 'HP 不变');
  b4.onMoveResult(move3(1));
  eq(b4.state.hp, 720, '无护盾时受伤');

  section('atkEvery=2 隔回合攻击');
  const b5 = new Battle(mkLevel([{ name: '慢速史莱姆', hp: 999999, atk: 50, atkEvery: 2 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b5.onMoveResult(move3(1));
  eq(b5.state.hp, 800, '第 1 回合不攻击');
  b5.onMoveResult(move3(1));
  eq(b5.state.hp, 750, '第 2 回合攻击');

  section('多敌人锁定与 setTarget');
  const b6 = new Battle(mkLevel([{ name: '小史莱姆', hp: 100, atk: 5, atkEvery: 1 },
    { name: '大史莱姆', hp: 9999, atk: 5, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b6.onMoveResult(move3(1));
  eq(b6.state.enemies[0].hp, 0, '默认打第一个');
  eq(b6.state.enemies[1].hp, 9999, '溢出伤害不转移（只打锁定目标）');
  ok(!b6.state.over, '还有存活敌人');
  b6.setTarget(1);
  eq(b6.currentTarget().name, '大史莱姆', '切换目标');
  // 深拷贝检查
  eq(b6.level.enemies[1].hp, 9999, '关卡数据不被修改');

  section('星级：剩余步数 5/2/1');
  const b7 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 0, atkEvery: 1 }], { steps: 20 }),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b7.movesUsed = 16; eq(b7.stars(), 2, '剩 4 步 → 2 星');
  b7.movesUsed = 19; eq(b7.stars(), 1, '剩 1 步 → 1 星');
  b7.extraSteps = 5; eq(b7.stars(), 3, '道具补步 → 3 星');

  section('checkGoal：collect 目标');
  const b8 = new Battle({ id: 9, type: 'collect', goal: { kind: 'collect', color: 0, count: 10 }, steps: 10, enemies: [] },
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  ok(b8.checkGoal({ matchedCounts: { 0: 5 } }) === false, '进度不足');
  ok(b8.checkGoal({ matchedCounts: { 0: 10 } }) === true, '达标判胜');
  ok(b8.state.over && b8.state.win, 'checkGoal 置 over/win');

  section('timed 关 tickTime');
  const b9 = new Battle({ id: 9, type: 'timed', goal: { kind: 'timed', score: 3000, time: 60 }, steps: 0, enemies: [] },
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  b9.tickTime(30);
  eq(b9.timeLeft, 30, '时间递减');
  ok(!b9.state.over, '未超时');
  eq(b9.stars(), 3, '剩余时间 ≥50% → 3 星');
  b9.tickTime(15);
  eq(b9.stars(), 2, '剩余 20%~50% → 2 星');
  b9.tickTime(20);
  eq(b9.stars(), 1, '剩余 <20% → 1 星');
  b9.tickTime(10);
  ok(b9.state.over && !b9.state.win, '超时判负');
}

console.log('== 6. Battle：技能 / CD / 震慑 / 共鸣 / 道具 ==');
{
  section('技能伤害 + CD 递减 + 震慑被动（大狗旺）');
  const board = stubBoard();
  const rng = rngSeq(0.1); // 震慑判定 0.1 < 0.40 → 命中
  const ds = CHARACTERS.find(c => c.id === 'dasangwang');
  const b1 = new Battle(mkLevel([{ name: '史莱姆王', hp: 5000, atk: 10, atkEvery: 1 }]),
    [mkChar('dasangwang', 200, 600, { skill: ds.skill, passive: ds.passive })], board, rng);
  const e0 = b1.state.enemies[0];
  const r1 = b1.useSkill(0);
  ok(r1.ok, '技能释放成功');
  eq(r1.damage, 600, 'ATK200×300% = 600');
  ok(board.calls.some(c => c[0] === 'clearArea' && c[1] === 4 && c[2] === 4 && c[3] === 1), '中心 3×3');
  eq(b1.state.skillCds.dasangwang, 5, 'CD = 5');
  eq(e0.hp, 4400, '敌人扣血');
  ok(b1.state.logs.some(l => l.includes('震慑')), '震慑日志');
  eq(e0.turnCount, 0, '被震慑跳过行动');
  const r2 = b1.useSkill(0);
  eq(r2.ok, false, 'CD 中不能再放');
  eq(r2.reason, 'cd', '原因 cd');
  b1.onMoveResult({ events: [], score: 0, matchedCounts: {}, moves: 0 });
  eq(b1.state.skillCds.dasangwang, 4, '每回合 CD-1');

  section('满级技能强化（5×5）');
  const board1b = stubBoard();
  const b1b = new Battle(mkLevel([{ name: '史莱姆王', hp: 99999, atk: 0, atkEvery: 9 }]),
    [mkChar('dasangwang', 200, 600, { skill: ds.skill, passive: ds.passive, skillLv: 10 })], board1b, rngSeq());
  b1b.useSkill(0);
  ok(board1b.calls.some(c => c[0] === 'clearArea' && c[3] === 2), '满级 5×5');

  section('天空之猫共鸣：CD-1 最低 1');
  const ft = CHARACTERS.find(c => c.id === 'feitianxia');
  const board2 = stubBoard();
  const b2 = new Battle(mkLevel([{ name: '史莱姆', hp: 99999, atk: 0, atkEvery: 9 }]),
    [mkChar('feitianxia', 160, 700, { skill: Object.assign({}, ft.skill, { dmgMult: 2, cd: 4 }) }),
     mkChar('hajimiao', 120, 800)], board2, rngSeq(0.3));
  ok(b2.hasResonance('skycat'), '天空之猫生效');
  const r2b = b2.useSkill(0);
  ok(r2b.ok, '飞天侠技能成功');
  eq(r2b.damage, 320, '160×200%');
  eq(b2.state.skillCds.feitianxia, 3, 'CD 4-1 = 3');
  ok(board2.calls.some(c => c[0] === 'clearCol' && c[1] === 2), '整列消除');

  section('猫狗双全共鸣：消除伤害 +10%');
  const b3 = new Battle(mkLevel([{ name: '史莱姆', hp: 99999, atk: 0, atkEvery: 9 }]),
    [mkChar('hajimiao', 120, 800), mkChar('dasangwang', 200, 600)], stubBoard(), rngSeq());
  ok(b3.hasResonance('catdog'), '猫狗双全生效');
  const r3 = b3.onMoveResult(move3(1));
  eq(r3.damage, 304, '(3×160×0.5×1.15)×1.1 = 304');

  section('怒吼王权共鸣：技能伤害 +50%');
  const zf = CHARACTERS.find(c => c.id === 'zifengzhiwang');
  const b4 = new Battle(mkLevel([{ name: '史莱姆', hp: 99999, atk: 0, atkEvery: 9 }]),
    [mkChar('dasangwang', 200, 600, { skill: ds.skill, passive: ds.passive }),
     mkChar('zifengzhiwang', 140, 1200, { skill: zf.skill, passive: zf.passive })], stubBoard(), rngSeq(0.99));
  ok(b4.hasResonance('roarkingship'), '怒吼王权生效');
  const r4 = b4.useSkill(0);
  eq(r4.damage, 900, '600×1.5');

  section('自封之王 rage：HP 阈值临时加攻（王者牧场翻倍阈值）');
  const xnDef = CHARACTERS.find(c => c.id === 'xiaoniu');
  const b5 = new Battle(mkLevel([{ name: '史莱姆', hp: 99999, atk: 0, atkEvery: 9 }]),
    [mkChar('zifengzhiwang', 100, 1200, { skill: zf.skill, passive: zf.passive }),
     mkChar('xiaoniu', 150, 750, { passive: xnDef.passive })], stubBoard(), rngSeq());
  ok(b5.hasResonance('kingranch'), '王者牧场生效');
  ok(b5.atkBuff > 0, '小牛 teamBuff 生效（队伍 2 人）');
  b5.state.hp = Math.round(b5.state.maxHp * 0.6); // 60% > 50% 但 < 翻倍阈值 100%
  const r5 = b5.onMoveResult(move3(0));
  // avgAtk = 125×1.15×1.3 = 186.875 → 3×186.875×0.5 = 280.3 → 280
  eq(r5.damage, 280, '阈值翻倍后 60% 血也触发 rage');
  const b5b = new Battle(mkLevel([{ name: '史莱姆', hp: 99999, atk: 0, atkEvery: 9 }]),
    [mkChar('zifengzhiwang', 100, 1200, { skill: zf.skill, passive: zf.passive }),
     mkChar('feitianxia', 100, 700)], stubBoard(), rngSeq());
  b5b.state.hp = Math.round(b5b.state.maxHp * 0.4); // 40% < 50% 基础阈值
  const r5b = b5b.onMoveResult(move3(0));
  eq(r5b.damage, 195, '无共鸣 40% 血 rage +30%');
  b5b.state.hp = Math.round(b5b.state.maxHp * 0.8); // 80% 不触发
  eq(b5b.onMoveResult(move3(0)).damage, 150, '80% 血无 rage');

  section('哈基喵被动：每 3 回合回 5% HP');
  const hjDef = CHARACTERS.find(c => c.id === 'hajimiao');
  const b6 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 100, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800, { passive: hjDef.passive })], stubBoard(), rngSeq());
  b6.onMoveResult({ events: [], score: 0, matchedCounts: {}, moves: 0 });
  b6.onMoveResult({ events: [], score: 0, matchedCounts: {}, moves: 0 });
  eq(b6.state.hp, 600, '前 2 回合受伤');
  b6.onMoveResult({ events: [], score: 0, matchedCounts: {}, moves: 0 });
  eq(b6.state.hp, 540, '第 3 回合回 40 再受伤 100');

  section('暖胃猫共鸣：每回合回 8% HP（V2.2 作用于所有存活成员）');
  const b7 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 0, atkEvery: 9 }]),
    [mkChar('mianshifu', 100, 650), mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  ok(b7.hasResonance('warmcat'), '暖胃猫生效');
  b7.state.members[0].hp = 500; // 面师傅受伤（哈基喵满血会被封顶）
  b7.state.hp = 500 + 800;
  b7.onMoveResult({ events: [], score: 0, matchedCounts: {}, moves: 0 });
  // 治疗额 = 1450×8% = 116，全额作用于每个存活成员：面师傅 500+116=616，哈基喵 800（封顶）
  eq(b7.state.members[0].hp, 616, '面师傅 +116');
  eq(b7.state.members[1].hp, 800, '哈基喵封顶');
  eq(b7.state.hp, 1416, 'state.hp = Σ成员hp');

  section('牛肉面套餐共鸣：开战送 1 随机道具');
  const b8 = new Battle(mkLevel([], { goal: { kind: 'collect', color: 0, count: 3 } }),
    [mkChar('mianshifu', 100, 650), mkChar('xiaoniu', 150, 750)], stubBoard(), rngSeq(0.5));
  ok(b8.hasResonance('beefnoodle'), '牛肉面套餐生效');
  eq(b8.state.freeItem, 'colorBottle', '随机道具已发放');

  section('战斗内道具');
  const board9 = stubBoard();
  const b9 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 0, atkEvery: 9 }]),
    [mkChar('hajimiao', 120, 800)], board9, rngSeq());
  b9.useItem('hammer', { r: 3, c: 4 });
  assert.deepEqual(board9.calls[0], ['clearCells', [{ r: 3, c: 4 }]]); passed++;
  b9.useItem('crossBomb', { r: 3, c: 4 });
  ok(board9.calls.some(c => c[0] === 'clearRow' && c[1] === 3) && board9.calls.some(c => c[0] === 'clearCol' && c[1] === 4), '十字 = 行+列');
  b9.useItem('colorBottle', null, { from: 0, to: 2 });
  assert.deepEqual(board9.calls.find(c => c[0] === 'convertColor'), ['convertColor', 0, 2]); passed++;
  b9.useItem('extraSteps');
  eq(b9.extraSteps, 5, '额外步数记录');
  b9.useItem('shield');
  eq(b9.state.shield, 1, '护盾 +1');
  eq(b9.useItem('unknown'), null, '未知道具返回 null');
}

console.log('== 7. 转转君命运转盘 ==');
{
  const zz = CHARACTERS.find(c => c.id === 'zhuanzhuanjun');
  const mkZZ = (skillLv = 1) => mkChar('zhuanzhuanjun', 100, 500, { skill: zz.skill, passive: zz.passive, skillLv });
  const lv = mkLevel([{ name: '史莱姆', hp: 10000, atk: 0, atkEvery: 9 }]);

  section('大吉：清除全部同色（最多色）ATK×400%');
  const bd1 = stubBoard(), bg1 = rngSeq(0.1);
  const b1 = new Battle(lv, [mkZZ()], bd1, bg1);
  const r1 = castSkill(b1.team[0], { board: bd1, battle: b1, rng: bg1, events: [] });
  eq(r1.wheel, '大吉', '命中大吉');
  eq(r1.damage, 400, '100×400%');
  const clearCall = bd1.calls.find(c => c[0] === 'clearCells');
  eq(clearCall[1].length, 40, '清除 40 个同色格');

  section('小吉：随机 5×5');
  const bd2 = stubBoard(), bg2 = rngSeq(0.3);
  const b2 = new Battle(lv, [mkZZ()], bd2, bg2);
  const r2 = castSkill(b2.team[0], { board: bd2, battle: b2, rng: bg2, events: [] });
  eq(r2.wheel, '小吉', '命中小吉');
  ok(bd2.calls.some(c => c[0] === 'clearArea' && c[3] === 2), '半径 2 = 5×5');

  section('大凶：啥也没发生');
  const bd3 = stubBoard(), bg3 = rngSeq(0.5);
  const b3 = new Battle(lv, [mkZZ()], bd3, bg3);
  const r3 = castSkill(b3.team[0], { board: bd3, battle: b3, rng: bg3, events: [] });
  eq(r3.wheel, '大凶', '命中大凶');
  eq(r3.damage, 0, '无伤害');
  eq(bd3.calls.length, 0, '无棋盘操作');

  section('逆转：打乱棋盘');
  const bd4 = stubBoard(), bg4 = rngSeq(0.8);
  const b4 = new Battle(lv, [mkZZ()], bd4, bg4);
  const r4 = castSkill(b4.team[0], { board: bd4, battle: b4, rng: bg4, events: [] });
  eq(r4.wheel, '逆转', '命中逆转');
  ok(bd4.calls.some(c => c[0] === 'shuffleAll'), 'shuffleAll 被调用');

  section('天上赌局共鸣：必大吉');
  const ft = CHARACTERS.find(c => c.id === 'feitianxia');
  const bd5 = stubBoard(), bg5 = rngSeq(0.99); // 本应逆转
  const b5 = new Battle(lv, [mkChar('feitianxia', 160, 700, { skill: ft.skill }), mkZZ()], bd5, bg5);
  ok(b5.hasResonance('skybet'), '天上赌局生效');
  const r5 = castSkill(b5.team[1], { board: bd5, battle: b5, rng: bg5, events: [] });
  eq(r5.wheel, '大吉', '强制大吉');

  section('满级超级大吉：清全场 + 秒杀非 Boss');
  const bd6 = stubBoard(), bg6 = rngSeq(0.1);
  const b6 = new Battle(lv, [mkZZ(10)], bd6, bg6);
  const r6 = castSkill(b6.team[0], { board: bd6, battle: b6, rng: bg6, events: [] });
  eq(r6.wheel, '超级大吉', '命中超级大吉');
  const cc = bd6.calls.find(c => c[0] === 'clearCells');
  eq(cc[1].length, 64, '清除全场 64 格');
  eq(b6.state.enemies[0].hp, 0, '非 Boss 被秒杀');
  ok(b6.state.over && b6.state.win, '战斗胜利');
}

console.log('== 8. V2.2 逐角色 HP / Boss trait / turnEvents ==');
{
  const empty = { events: [], score: 0, matchedCounts: {}, moves: 0 };

  section('多成员各自承伤 + state.hp = Σ成员hp');
  const v1 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 100, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800), mkChar('dasangwang', 200, 400)], stubBoard(), rngSeq(0, 0.5));
  eq(v1.state.members.length, 2, '成员数 2');
  eq(v1.state.members[0].maxHp, 800, '成员 maxHp');
  eq(v1.state.maxHp, 1200, 'state.maxHp = Σ');
  eq(v1.state.hp, 1200, 'state.hp = Σ');
  v1.onMoveResult(empty); // rng 0 → 命中成员0
  eq(v1.state.members[0].hp, 700, '成员0 承伤');
  eq(v1.state.members[1].hp, 400, '成员1 不承伤');
  eq(v1.state.hp, 1100, 'state.hp 同步');
  v1.onMoveResult(empty); // rng 0.5 → int(2)=1 → 命中成员1
  eq(v1.state.members[1].hp, 300, '成员1 承伤');
  ok(!v1.state.members[0].fainted && !v1.state.members[1].fainted, '均未倒下');
  const atkEv1 = v1.turnEvents.find(e => e.kind === 'enemyAttack');
  ok(atkEv1 && atkEv1.enemy === 0 && atkEv1.target === 1 && atkEv1.dmg === 100, 'enemyAttack 事件记录');

  section('成员倒下（fainted）→ 技能不可用 + avgAtk 只算存活者');
  const v2 = new Battle(mkLevel([{ name: '大魔王', hp: 999999, atk: 350, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800), mkChar('feitianxia', 160, 300)], stubBoard(), rngSeq(0.9));
  v2.onMoveResult(empty); // rng 0.9 → 命中成员1（300 血 < 350）→ 倒下
  ok(v2.state.members[1].fainted, '成员1 fainted');
  eq(v2.state.members[1].hp, 0, '倒下成员 hp 归零');
  ok(!v2.state.over, '仍有存活成员，未战败');
  const r2f = v2.useSkill(1);
  eq(r2f.ok, false, 'fainted 成员不可施放');
  eq(r2f.reason, 'fainted', '原因 fainted');
  const r2d = v2.onMoveResult(move3(0)); // 伤害只按存活成员0：3×120×0.5 = 180
  eq(r2d.damage, 180, 'avgAtk 只统计存活成员');

  section('全员倒下 → 战败');
  const v3 = new Battle(mkLevel([{ name: '大魔王', hp: 999999, atk: 900, atkEvery: 1 }]),
    [mkChar('hajimiao', 120, 800), mkChar('dasangwang', 200, 800)], stubBoard(), rngSeq(0, 0.5));
  v3.onMoveResult(empty);
  ok(!v3.state.over, '第一回合仅倒 1 人');
  v3.onMoveResult(empty);
  ok(v3.state.over && !v3.state.win, '全员倒下战败');
  ok(v3.state.members.every(m => m.fainted), '全部 fainted');
  eq(v3.state.hp, 0, 'state.hp 归零');
  eq(v3.turnEvents.filter(e => e.kind === 'memberFainted').length, 1, '本回合 1 个 memberFainted');

  section('healPlayer 治疗所有存活成员全额（倒下者不回）');
  const v4 = new Battle(mkLevel([{ name: '史莱姆', hp: 999999, atk: 0, atkEvery: 9 }]),
    [mkChar('hajimiao', 120, 800), mkChar('dasangwang', 200, 400)], stubBoard(), rngSeq());
  v4.state.members[0].hp = 700;
  v4.state.members[1].hp = 100;
  v4.healPlayer(100);
  eq(v4.state.members[0].hp, 800, '成员0 回满封顶');
  eq(v4.state.members[1].hp, 200, '成员1 全额 +100');
  eq(v4.state.hp, 1000, 'state.hp 同步');
  v4.state.members[1].hp = 0;
  v4.state.members[1].fainted = true;
  v4.healPlayer(100);
  eq(v4.state.members[1].hp, 0, '倒下成员不被治疗');
  eq(v4.state.members[0].hp, 800, '存活成员正常回复');

  section('shell 缩壳：受伤减半 1 回合');
  const v5 = new Battle(mkLevel([{ name: '缩壳龟', hp: 10000, atk: 0, atkEvery: 9, trait: 'shell', traitEvery: 2 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  v5.onMoveResult(empty); // t1：未触发
  eq(v5.state.enemies[0].shieldTurns, 0, 't1 未触发');
  eq(v5.damageEnemy(200), 200, '无减伤');
  v5.onMoveResult(empty); // t2：shell 触发
  const bs5 = v5.turnEvents.find(e => e.kind === 'bossSkill');
  ok(bs5 && bs5.trait === 'shell' && bs5.name === '缩壳' && bs5.enemy === 0, 'bossSkill 事件');
  eq(v5.state.enemies[0].shieldTurns, 1, 'shieldTurns=1');
  eq(v5.damageEnemy(200), 100, '减伤一半');
  v5.onMoveResult(empty); // t3：递减归零且不再触发
  eq(v5.state.enemies[0].shieldTurns, 0, 't3 过期');
  eq(v5.damageEnemy(200), 200, '恢复全额');

  section('rockfall 落石：写入 rowLocks 且回合递减移除');
  const v6 = new Battle(mkLevel([{ name: '落石怪', hp: 999999, atk: 0, atkEvery: 9, trait: 'rockfall', traitEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq(0.3, 0.6));
  v6.onMoveResult(empty); // rng 0.3 → row 2
  eq(v6.state.rowLocks.length, 1, '1 条锁定');
  eq(v6.state.rowLocks[0].row, 2, '随机行 2');
  eq(v6.state.rowLocks[0].turns, 3, '持续 3 回合');
  v6.onMoveResult(empty); // 旧锁递减 → 2，新增 row 4
  eq(v6.state.rowLocks[0].turns, 2, '回合递减');
  eq(v6.state.rowLocks.length, 2, '第二条锁');
  v6.onMoveResult(empty);
  v6.onMoveResult(empty); // 首条（row2）归零移除
  eq(v6.state.rowLocks[0].row, 4, 'row2 已移除');
  eq(v6.state.rowLocks[0].turns, 1, 'row4 剩 1');
  ok(v6.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'rockfall' && e.name === '落石'), '落石事件');

  section('noise 噪音波：随机 2 行锁 1 回合');
  const v7 = new Battle(mkLevel([{ name: '噪音怪', hp: 999999, atk: 0, atkEvery: 9, trait: 'noise', traitEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq(0.1, 0.2));
  v7.onMoveResult(empty);
  eq(v7.state.rowLocks.length, 2, '2 条锁定');
  ok(v7.state.rowLocks[0].row !== v7.state.rowLocks[1].row, '两行不同');
  eq(v7.state.rowLocks[0].turns, 1, '持续 1 回合');
  ok(v7.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'noise' && e.name === '噪音波'), '噪音波事件');

  section('tornado / gust：调用 board 原子操作并记 _bossEvents');
  const bd8 = stubBoard();
  const v8 = new Battle(mkLevel([
    { name: '龙卷怪', hp: 999999, atk: 0, atkEvery: 9, trait: 'tornado', traitEvery: 1 },
    { name: '卷风怪', hp: 999999, atk: 0, atkEvery: 9, trait: 'gust', traitEvery: 1 }
  ]), [mkChar('hajimiao', 120, 800)], bd8, rngSeq(0.25, 0.5));
  v8.onMoveResult(empty);
  ok(bd8.calls.some(c => c[0] === 'clearArea' && c[3] === 1), 'clearArea 3×3');
  ok(bd8.calls.some(c => c[0] === 'shuffleAll'), 'shuffleAll');
  ok(v8._bossEvents.some(e => e.type === 'match'), '_bossEvents 含真实棋盘消除事件（clearArea）');
  ok(v8._bossEvents.some(e => e.type === 'fall'), '_bossEvents 含真实棋盘事件（shuffleAll）');
  const bs8 = v8.turnEvents.filter(e => e.kind === 'bossSkill');
  eq(bs8.length, 2, '两个 bossSkill 事件');
  ok(bs8.some(e => e.trait === 'tornado' && e.name === '龙卷风' && e.enemy === 0), '龙卷风命名+敌人索引');
  ok(bs8.some(e => e.trait === 'gust' && e.name === '卷风' && e.enemy === 1), '卷风命名+敌人索引');

  section('fog 起雾：fogTurns=2 且回合递减');
  const v9 = new Battle(mkLevel([{ name: '雾怪', hp: 999999, atk: 0, atkEvery: 9, trait: 'fog', traitEvery: 3 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq());
  v9.onMoveResult(empty); // t1
  v9.onMoveResult(empty); // t2
  eq(v9.state.fogTurns, 0, '未起雾');
  v9.onMoveResult(empty); // t3：触发
  eq(v9.state.fogTurns, 2, 'fogTurns=2');
  ok(v9.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'fog' && e.name === '起雾'), '起雾事件');
  v9.onMoveResult(empty); // t4：递减
  eq(v9.state.fogTurns, 1, '递减 1');
  v9.onMoveResult(empty); // t5：消散
  eq(v9.state.fogTurns, 0, '消散');

  section('bet 押注：未命中受 500 伤 / 命中回血 5%');
  const v10 = new Battle(mkLevel([{ name: '赌怪', hp: 1000, atk: 0, atkEvery: 9, trait: 'bet', traitEvery: 1 }]),
    [mkChar('hajimiao', 120, 800)], stubBoard(), rngSeq(0.2, 0.2));
  v10.onMoveResult(empty);
  eq(v10.betColor, 1, '押注色 = floor(0.2×6) = 1');
  ok(v10.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'bet' && e.name === '押注'), '押注事件');
  let rv = v10.playerClearsColor(0, 5); // 未命中
  ok(rv && rv.hit === false, '未命中');
  eq(v10.state.enemies[0].hp, 500, '锁定敌人受 500 伤');
  eq(v10.betColor, null, '押注一次性，判定后重置');
  ok(v10.turnEvents.some(e => e.kind === 'betResult' && e.hit === false), 'betResult 事件');
  v10.onMoveResult(empty); // 再押（rng 0.2 → 又是 1）
  eq(v10.betColor, 1, 'trait 再触发重新押注');
  rv = v10.playerClearsColor(1, 3); // 命中
  ok(rv && rv.hit === true, '命中');
  eq(v10.state.enemies[0].hp, 550, '回血 5% = 50');

  section('allin 全押：HP<40% 攻击翻倍，3 回合后失效');
  const v11 = new Battle(mkLevel([{ name: '全押王', hp: 1000, atk: 100, atkEvery: 1, trait: 'allin', traitEvery: 1 }]),
    [mkChar('hajimiao', 120, 2000)], stubBoard(), rngSeq());
  v11.state.enemies[0].hp = 300; // 30% < 40%
  v11.onMoveResult(empty); // t1：触发 + 攻击 ×2
  const e11 = v11.state.enemies[0];
  eq(e11.atkBuff, 1, 'atkBuff=1');
  eq(e11.atkBuffTurns, 3, '持续 3 回合');
  eq(v11.state.members[0].hp, 1800, '攻击翻倍 200');
  e11.hp = 900; // 抬回 40% 以上，观察 buff 自然过期
  v11.onMoveResult(empty); // t2 ×2
  v11.onMoveResult(empty); // t3 ×2
  eq(v11.state.members[0].hp, 1400, '第 2/3 回合仍翻倍');
  v11.onMoveResult(empty); // t4：buff 到期
  eq(e11.atkBuff, 0, 'buff 失效');
  eq(v11.state.members[0].hp, 1300, '第 4 回合恢复 100');
  ok(v11.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'allin' && e.name === '全押'), '全押事件');

  section('summon 召唤：小怪上限 4');
  const v12 = new Battle(mkLevel([{ name: '召唤师', hp: 999999, atk: 0, atkEvery: 9, trait: 'summon', traitEvery: 1 }]),
    [mkChar('hajimiao', 120, 100000)], stubBoard(), rngSeq());
  v12.onMoveResult(empty);
  eq(v12.state.enemies.length, 2, 't1 召唤 1');
  v12.onMoveResult(empty);
  v12.onMoveResult(empty);
  eq(v12.state.enemies.length, 4, 't3 达到上限 4');
  v12.onMoveResult(empty);
  eq(v12.state.enemies.length, 4, '不再超出上限');
  const minion = v12.state.enemies[1];
  eq(minion.name, '小怪', '小怪');
  eq(minion.hp, 800, '小怪 HP 800');
  eq(minion.atk, 100, '小怪 ATK 100');
  ok(v12.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'summon' && e.name === '召唤'), '召唤事件');

  section('turnEvents 完整性 / 每回合清空 / slotCounter 递增');
  const v13 = new Battle(mkLevel([{ name: '记录怪', hp: 999999, atk: 60, atkEvery: 1, trait: 'sub_convert', traitEvery: 1 }]),
    [mkChar('hajimiao', 120, 800), mkChar('feitianxia', 160, 50)], stubBoard(), rngSeq(0.9));
  eq(v13.state.slotCounter, 0, '初始 0');
  v13.onMoveResult(empty); // sub_convert 触发 + 攻击成员1（rng 0.9 → idx1）→ 倒下
  eq(v13.state.slotCounter, 1, 'slotCounter +1');
  eq(v13.turnEvents[0].kind, 'bossSkill', 'bossSkill 在前');
  ok(v13.turnEvents.some(e => e.kind === 'bossSkill' && e.trait === 'sub_convert' && e.name === '子化'), 'sub_convert 只记事件');
  const atk13 = v13.turnEvents.find(e => e.kind === 'enemyAttack');
  ok(atk13 && atk13.enemy === 0 && atk13.target === 1 && atk13.dmg === 60, 'enemyAttack 记录');
  ok(v13.turnEvents.some(e => e.kind === 'memberFainted' && e.idx === 1), 'memberFainted 记录');
  const r13 = v13.onMoveResult(move3(0)); // 新回合：事件清空重记；伤害只按存活成员0
  eq(r13.damage, 180, 'avgAtk 只算存活者');
  eq(v13.state.slotCounter, 2, 'slotCounter 2');
  ok(v13.turnEvents.length >= 1 && v13.turnEvents.every(e => !(e.kind === 'memberFainted' && e.idx === 1)), '上一回合事件已清空');
}

console.log(`\n全部通过：${passed} 项断言 ✓`);
