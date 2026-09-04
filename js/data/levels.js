// levels.js — 《梗灵大陆》章节 + 关卡配置（只读常量，数值严格按 gengling_req2.txt）
// 结构严格按 ARCHITECTURE.md 第 3 节。
//
// goal.kind 字段结构说明：
//   collect     {kind:'collect', color:int|null, count}                 消除指定颜色方块，color=null 表示任意颜色
//               双色/多色收集用 {kind:'collect', list:[{color, count}, ...]}
//               可选 time:秒（限时收集关，steps=0 表示无步数限制）
//   fourMatch   {kind:'fourMatch', count}                               触发 n 次 4 连消（产生炸弹）
//   fiveMatch   {kind:'fiveMatch', count}                               触发 n 次 5 连消（产生彩虹球）
//   bombClear   {kind:'bombClear', count}                               用炸弹消除 n 个方块
//   rainbowRed  {kind:'rainbowRed', color}                              使用彩虹球消除全部指定颜色方块
//   score       {kind:'score', score, time?}                            获得 score 分，可选限时
//   enemy       {kind:'enemy'}                                          击败所有敌人（enemies 数组）
//   timed       {kind:'timed', score?, time}                            限时获得分数
//   chainClear  {kind:'chainClear', count}                              消除全部 n 个锁链方块
//   treasure    {kind:'treasure', count}                                触发 n 次宝箱
//   floatClear  {kind:'floatClear', count}                              消除 n 个浮空方块
//   silentClear {kind:'silentClear', count}                             消除 n 个静音区覆盖的方块
//   clearEcho   {kind:'clearEcho', count}                               消除全部 n 个回声石
//   subClear    {kind:'subClear', count}                                消除 n 个子方块
//   slot        {kind:'slot', count}                                    触发 n 次老虎机奖励
//   gamble      {kind:'gamble', mode:'highRisk'}                        赌局选择：高风险模式通关
//   combo       {kind:'combo', parts:[goal, ...]}                       多目标综合关
//
// board 字段：{ ice:[{r,c,hp}], chain:[{r,c,hits}], echo:[{r,c}], silent:[{r,c,layer}] }
//   echo   回声石：消除后在相邻位再生同色方块
//   silent 静音区：区域上方块锁定，需先消除周围方块解锁（layer=2 为双层静音）
// 第 3-7 章的气流/浮空/宝箱/子方块/老虎机/赌局等机制文档未给出具体格子配置，
// board 内放空数组，机制名记在 special 字段（引擎暂不实现）。

// ===== 章节总览（按文档第 6 页表格）=====
export const CHAPTERS = [
  { id: 1, name: '梗灵觉醒', theme: '草原/村庄', count: 15, colors: 4, unlock: null, startId: 1, box: '哈基喵碎片×10、金币×500、锤子×3' },
  { id: 2, name: '声波峡谷', theme: '峡谷/洞穴', count: 20, colors: 5, unlock: '通关第一章', startId: 16, box: '飞天侠碎片×10、金币×1000、十字炸弹×3、颜色转换瓶×1' },
  { id: 3, name: '云端天路', theme: '浮空岛/云层', count: 20, colors: 5, unlock: '通关第二章', startId: 37, box: '金币×2000、锤子×5、十字炸弹×3、额外5步×2、飞天侠碎片×15' },
  { id: 4, name: '命运赌场', theme: '赌场/迷宫', count: 25, colors: 6, unlock: '通关第三章', startId: 57, box: '转转君碎片×10、金币×3000、颜色转换瓶×3、额外5步×3' },
  { id: 5, name: '王座废墟', theme: '废墟/王城', count: 25, colors: 6, unlock: '通关第四章', startId: 82, box: '自封之王碎片×10、金币×5000、锤子×8、十字炸弹×5、额外5步×5' },
  { id: 6, name: '牧场秘境', theme: '牧场/温泉', count: 20, colors: 5, unlock: '通关第五章', startId: 107, box: '小牛碎片×10、金币×6000、颜色转换瓶×5、额外5步×5、护盾×3' },
  { id: 7, name: '忘情面馆', theme: '面馆/夜市', count: 20, colors: 6, unlock: '通关第六章', startId: 127, box: '面师傅碎片×10、金币×8000、锤子×10、十字炸弹×8、颜色转换瓶×5、额外5步×8' },
  { id: 8, name: '梗灵之巅', theme: '星空/虚空', count: 10, colors: 7, unlock: '集齐全部7个角色且每角色≥15级', startId: 147, box: '称号"梗灵之主"、全角色觉醒材料×1、金币×20000、专属头像框、解锁无尽模式' }
];

// ===== 小工具 =====
// 生成矩形区域格子配置（含边界）
function rectCells(r1, c1, r2, c2, extra) {
  const out = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(Object.assign({ r, c }, extra));
  return out;
}

// ===== 第一章「梗灵觉醒」15 关（文档第 9 页逐关表精确录入）=====
const CH1 = [
  {
    id: 1, chapter: 1, name: '教学-消除', type: 'collect',
    goal: { kind: 'collect', color: 0, count: 10 },
    steps: 15, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    tutorial: '消除10个红色方块：高亮提示可消除组合，滑动交换3个同色方块即可消除。',
    special: '教学关，高亮提示可消除组合',
    rewards: { gold: 50, candy: { small: 3 }, shard: 1, shardChar: 'hajimiao' },
    boss: false, unlockChar: 'hajimiao', power: 100
  },
  {
    id: 2, chapter: 1, name: '教学-连消', type: 'collect',
    goal: { kind: 'fourMatch', count: 1 },
    steps: 12, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    tutorial: '引导滑动4个同色方块，触发4连消生成炸弹。',
    special: '教学关，引导滑动4个同色',
    rewards: { gold: 50, candy: { small: 3 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 150
  },
  {
    id: 3, chapter: 1, name: '教学-炸弹', type: 'collect',
    goal: { kind: 'bombClear', count: 20 },
    steps: 12, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    tutorial: '引导点击炸弹触发，使用炸弹消除20个方块。',
    special: '教学关，引导点击炸弹触发',
    rewards: { gold: 60, candy: { small: 3 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 200
  },
  {
    id: 4, chapter: 1, name: '教学-彩虹球', type: 'collect',
    goal: { kind: 'fiveMatch', count: 1 },
    steps: 15, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    tutorial: '引导滑动5个同色方块，触发5连消生成彩虹球。',
    special: '教学关，引导滑动5个同色',
    rewards: { gold: 60, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 250
  },
  {
    id: 5, chapter: 1, name: '教学-彩虹球组合', type: 'collect',
    goal: { kind: 'rainbowRed', color: 0 },
    steps: 10, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    tutorial: '引导彩虹球+颜色组合：把彩虹球与红色方块交换，就能一次消除全场红色方块，达成即过关！',
    special: '教学关，引导彩虹球+颜色组合',
    rewards: { gold: 80, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: 'dasangwang', power: 300
  },
  {
    id: 6, chapter: 1, name: '消除计分', type: 'score',
    goal: { kind: 'score', score: 800 },
    steps: 15, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '首个正式关，开始有星级评价',
    rewards: { gold: 80, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 400
  },
  {
    id: 7, chapter: 1, name: '消除计分-冰块', type: 'score',
    goal: { kind: 'score', score: 1500 },
    steps: 18, colors: 4, enemies: [],
    board: { ice: [{ r: 3, c: 2, hp: 2 }, { r: 3, c: 5, hp: 2 }, { r: 4, c: 2, hp: 2 }, { r: 4, c: 5, hp: 2 }], chain: [], echo: [], silent: [] },
    special: '引入"冰块"方块：需消除其下方方块2次才能破碎',
    rewards: { gold: 80, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 500
  },
  {
    id: 8, chapter: 1, name: '收集-双目标', type: 'collect',
    goal: { kind: 'collect', list: [{ color: 1, count: 15 }, { color: 2, count: 15 }] },
    steps: 20, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '双收集目标：15蓝色+15绿色',
    rewards: { gold: 100, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 600
  },
  {
    id: 9, chapter: 1, name: '击败小史莱姆', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 20, colors: 4,
    enemies: [{ name: '小史莱姆', hp: 500, atk: 80, atkEvery: 1, trait: 'none' }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '首个战斗关',
    rewards: { gold: 100, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 700
  },
  {
    id: 10, chapter: 1, name: '击败中史莱姆', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 22, colors: 4,
    enemies: [{ name: '中史莱姆', hp: 1200, atk: 120, atkEvery: 1, trait: 'none' }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '获得面师傅',
    rewards: { gold: 100, candy: { small: 5 }, shard: 2, shardChar: null },
    boss: false, unlockChar: 'mianshifu', power: 850
  },
  {
    id: 11, chapter: 1, name: '收集+计时', type: 'timed',
    goal: { kind: 'collect', color: 0, count: 30, time: 60 },
    steps: 0, colors: 4, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '首个限时关：60秒内消除30个红色方块（无步数限制）',
    rewards: { gold: 120, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 900
  },
  {
    id: 12, chapter: 1, name: '突破障碍-锁链', type: 'collect',
    goal: { kind: 'chainClear', count: 8 },
    steps: 20, colors: 4, enemies: [],
    board: {
      ice: [],
      chain: rectCells(3, 2, 4, 5, { hits: 3 }), // 8 个锁链方块，需在旁边消除3次解锁
      echo: [], silent: []
    },
    special: '锁链方块：需在旁边消除3次才能解锁',
    rewards: { gold: 120, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 1000
  },
  {
    id: 13, chapter: 1, name: '击败双史莱姆', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 25, colors: 4,
    enemies: [
      { name: '史莱姆A', hp: 1000, atk: 100, atkEvery: 1, trait: 'none' },
      { name: '史莱姆B', hp: 1000, atk: 100, atkEvery: 1, trait: 'none' }
    ],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '双目标',
    rewards: { gold: 120, candy: { small: 5 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 1200
  },
  {
    id: 14, chapter: 1, name: '收集+障碍', type: 'collect',
    goal: { kind: 'collect', color: 2, count: 20 },
    steps: 22, colors: 4, enemies: [],
    board: { ice: [{ r: 2, c: 3, hp: 1 }, { r: 2, c: 4, hp: 1 }, { r: 5, c: 3, hp: 1 }, { r: 5, c: 4, hp: 1 }], chain: [], echo: [], silent: [] },
    special: '棋盘含4个冰块障碍，冰块覆盖部分目标方块',
    rewards: { gold: 150, candy: { small: 5 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 1500
  },
  {
    id: 15, chapter: 1, name: 'Boss战-无聊魔王·初阶', type: 'boss',
    goal: { kind: 'enemy' },
    steps: 30, colors: 4,
    enemies: [{ name: '无聊魔王·初阶', hp: 5000, atk: 100, atkEvery: 1, trait: 'none' }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: 'Boss关，推荐战力2000',
    rewards: { gold: 500, candy: { small: 5, medium: 1 }, shard: 4, shardChar: 'hajimiao' },
    boss: true, unlockChar: null, power: 2000
  }
];

// ===== 第二章「声波峡谷」（文档第 12 页逐关表精确录入，id 16-36）=====
const CH2 = [
  {
    id: 16, chapter: 2, name: '消除计分', type: 'score',
    goal: { kind: 'score', score: 2500 },
    steps: 20, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '首次5色棋盘（新增紫色）',
    rewards: { gold: 120, candy: { small: 3 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 2200
  },
  {
    id: 17, chapter: 2, name: '收集-紫色', type: 'collect',
    goal: { kind: 'collect', color: 3, count: 20 },
    steps: 20, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '紫色出现概率略低',
    rewards: { gold: 120, candy: { small: 3 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 2400
  },
  {
    id: 18, chapter: 2, name: '击败回声蝠', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 22, colors: 5,
    enemies: [{ name: '回声蝠', hp: 2000, atk: 150, atkEvery: 1, trait: 'none' }],
    board: { ice: [], chain: [], echo: [{ r: 2, c: 2 }, { r: 2, c: 5 }, { r: 5, c: 2 }, { r: 5, c: 5 }], silent: [] },
    special: '引入回声石：消除后在相邻位置再生同色方块',
    rewards: { gold: 140, candy: { small: 3 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 2600
  },
  {
    id: 19, chapter: 2, name: '收集+回声', type: 'collect',
    goal: { kind: 'collect', color: null, count: 40 },
    steps: 20, colors: 5, enemies: [],
    board: { ice: [], chain: [], echo: rectCells(2, 2, 3, 4), silent: [] }, // 棋盘预设6个回声石
    special: '利用回声石消除40个任意方块，棋盘预设6个回声石',
    rewards: { gold: 140, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 2800
  },
  {
    id: 20, chapter: 2, name: '突破障碍-锁链+紫', type: 'collect',
    goal: { kind: 'combo', parts: [{ kind: 'chainClear', count: 6 }, { kind: 'collect', color: 3, count: 10 }] },
    steps: 22, colors: 5, enemies: [],
    board: { ice: [], chain: rectCells(3, 3, 4, 5, { hits: 3 }), echo: [], silent: [] },
    special: '锁链+紫色双目标',
    rewards: { gold: 150, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 3000
  },
  {
    id: 21, chapter: 2, name: '击败岩石蟹', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 25, colors: 5,
    enemies: [{ name: '岩石蟹', hp: 2800, atk: 180, atkEvery: 1, trait: 'shell', traitParam: { every: 3, dur: 1, reduce: 0.5 } }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '每3回合"缩壳"（减伤50%）1回合，需在缩壳窗口期集中输出',
    rewards: { gold: 150, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 3200
  },
  {
    id: 22, chapter: 2, name: '消除计分-高分', type: 'score',
    goal: { kind: 'score', score: 4000 },
    steps: 20, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '高分关',
    rewards: { gold: 150, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 3400
  },
  {
    id: 23, chapter: 2, name: '收集-蓝+红', type: 'collect',
    goal: { kind: 'collect', list: [{ color: 1, count: 25 }, { color: 0, count: 25 }] },
    steps: 25, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '双收集',
    rewards: { gold: 160, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 3600
  },
  {
    id: 24, chapter: 2, name: '击败回声蝠群', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 25, colors: 5,
    enemies: [
      { name: '回声蝠A', hp: 1200, atk: 120, atkEvery: 1, trait: 'none' },
      { name: '回声蝠B', hp: 1200, atk: 120, atkEvery: 1, trait: 'none' },
      { name: '回声蝠C', hp: 1200, atk: 120, atkEvery: 1, trait: 'none' }
    ],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '多目标',
    rewards: { gold: 160, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 3800
  },
  {
    id: 25, chapter: 2, name: '静音区教学', type: 'collect',
    goal: { kind: 'collect', color: 3, count: 5 },
    steps: 20, colors: 5, enemies: [],
    board: {
      ice: [], chain: [], echo: [],
      silent: [{ r: 3, c: 3, layer: 1 }, { r: 3, c: 4, layer: 1 }, { r: 4, c: 3, layer: 1 }, { r: 4, c: 4, layer: 1 }, { r: 2, c: 3, layer: 1 }]
    },
    special: '首次引入静音区：灰色区域方块无法直接消除，需消除周围方块解锁',
    rewards: { gold: 160, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 4000
  },
  {
    id: 26, chapter: 2, name: '收集+静音', type: 'collect',
    goal: { kind: 'silentClear', count: 15 },
    steps: 22, colors: 5, enemies: [],
    board: {
      ice: [], chain: [], echo: [],
      silent: [...rectCells(0, 0, 0, 6, { layer: 1 }), ...rectCells(3, 0, 4, 5, { layer: 1 }), ...rectCells(7, 1, 7, 7, { layer: 1 })]
    },
    special: '静音区覆盖约30%棋盘',
    rewards: { gold: 170, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 4200
  },
  {
    id: 27, chapter: 2, name: '击败峡谷守卫', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 28, colors: 5,
    enemies: [{ name: '峡谷守卫', hp: 4000, atk: 200, atkEvery: 1, trait: 'rockfall', traitParam: { every: 4, rows: 1, dur: 3 } }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '每4回合释放"落石"（随机封锁1行3回合），被封锁行无法操作',
    rewards: { gold: 170, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 4400
  },
  {
    id: 28, chapter: 2, name: '限时挑战', type: 'timed',
    goal: { kind: 'score', score: 3000, time: 60 },
    steps: 0, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '限时关：60秒内获得3000分',
    rewards: { gold: 170, candy: { small: 4 }, shard: 1, shardChar: null },
    boss: false, unlockChar: null, power: 4600
  },
  {
    id: 29, chapter: 2, name: '收集-回声石', type: 'collect',
    goal: { kind: 'clearEcho', count: 12 },
    steps: 25, colors: 5, enemies: [],
    board: { ice: [], chain: [], echo: rectCells(1, 1, 2, 3).concat(rectCells(5, 4, 6, 6)), silent: [] },
    special: '回声石消除后不再回声',
    rewards: { gold: 180, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 4800
  },
  {
    id: 30, chapter: 2, name: '击败双岩石蟹', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 28, colors: 5,
    enemies: [
      { name: '岩石蟹A', hp: 3000, atk: 200, atkEvery: 1, trait: 'shell', traitParam: { every: 3, dur: 1, reduce: 0.5, alternate: true } },
      { name: '岩石蟹B', hp: 3000, atk: 200, atkEvery: 1, trait: 'shell', traitParam: { every: 3, dur: 1, reduce: 0.5, alternate: true } }
    ],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: '交替缩壳：一只缩壳时另一只正常',
    rewards: { gold: 180, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 5000
  },
  {
    id: 31, chapter: 2, name: '突破障碍-静音核心', type: 'collect',
    goal: { kind: 'silentClear', count: 8 },
    steps: 22, colors: 5, enemies: [],
    board: { ice: [], chain: [], echo: [], silent: rectCells(3, 2, 4, 5, { layer: 2 }) },
    special: '核心方块被双层静音覆盖',
    rewards: { gold: 180, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 5200
  },
  {
    id: 32, chapter: 2, name: '消除计分-高分', type: 'score',
    goal: { kind: 'score', score: 6000 },
    steps: 22, colors: 5, enemies: [],
    board: { ice: [], chain: [], echo: [{ r: 1, c: 1 }, { r: 1, c: 6 }, { r: 6, c: 1 }, { r: 6, c: 6 }], silent: [] },
    special: '高分关，棋盘含4个回声石',
    rewards: { gold: 190, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 5400
  },
  {
    id: 33, chapter: 2, name: '收集-紫+绿', type: 'collect',
    goal: { kind: 'collect', list: [{ color: 3, count: 30 }, { color: 2, count: 20 }] },
    steps: 25, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] },
    special: '大量收集',
    rewards: { gold: 190, candy: { small: 4 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 5600
  },
  {
    id: 34, chapter: 2, name: '击败峡谷领主', type: 'enemy',
    goal: { kind: 'enemy' },
    steps: 30, colors: 5,
    enemies: [{ name: '峡谷领主', hp: 6000, atk: 250, atkEvery: 1, trait: 'summon', traitParam: { atHpPct: 0.5, summon: { name: '回声蝠', hp: 800, atk: 120, count: 2 } } }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: 'HP低于50%时召唤2只回声蝠（各HP=800）',
    rewards: { gold: 200, candy: { small: 5 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 5800
  },
  {
    id: 35, chapter: 2, name: '综合挑战', type: 'combo',
    goal: { kind: 'combo', parts: [{ kind: 'score', score: 5000 }, { kind: 'chainClear', count: 6 }] },
    steps: 25, colors: 5, enemies: [],
    board: { ice: [], chain: rectCells(3, 1, 4, 5, { hits: 3 }), echo: [], silent: [] },
    special: '双目标综合关：5000分+消除全部6个锁链方块',
    rewards: { gold: 200, candy: { small: 5 }, shard: 2, shardChar: null },
    boss: false, unlockChar: null, power: 6000
  },
  {
    id: 36, chapter: 2, name: 'Boss战-噪音怪兽', type: 'boss',
    goal: { kind: 'enemy' },
    steps: 35, colors: 5,
    enemies: [{ name: '噪音怪兽', hp: 12000, atk: 200, atkEvery: 1, trait: 'noiseWave', traitParam: { every: 3, rows: 2, dur: 1 } }],
    board: { ice: [], chain: [], echo: [], silent: [] },
    special: 'Boss关，推荐战力5000，通关获得飞天侠；每3回合释放"噪音波"（随机2行变为静音区持续1回合）',
    rewards: { gold: 800, candy: { small: 5, medium: 1 }, shard: 4, shardChar: 'dasangwang' },
    boss: true, unlockChar: 'feitianxia', power: 5000
  }
];

// ===== 第三章「云端天路」20 关（id 37-56，按文档第 15 页表格录入）=====
const CH3 = [
  { id: 37, chapter: 3, name: '消除计分', type: 'score', goal: { kind: 'score', score: 5000 }, steps: 20, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次出现气流（每2回合随机1列方块被吹走）', rewards: { gold: 200, candy: { small: 3 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 6200 },
  { id: 38, chapter: 3, name: '收集-蓝色', type: 'collect', goal: { kind: 'collect', color: 1, count: 25 }, steps: 22, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '气流打乱布局', rewards: { gold: 200, candy: { small: 3 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 6400 },
  { id: 39, chapter: 3, name: '击败风精灵', type: 'enemy', goal: { kind: 'enemy' }, steps: 25, colors: 5, enemies: [{ name: '风精灵', hp: 4500, atk: 220, atkEvery: 1, trait: 'dodge', traitParam: { p: 0.2, reduce: 0.5 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '20%概率"闪避"（伤害减半），需高消除倍率', rewards: { gold: 210, candy: { small: 3 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 6600 },
  { id: 40, chapter: 3, name: '浮空教学', type: 'collect', goal: { kind: 'floatClear', count: 3 }, steps: 18, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次引入浮空方块：悬浮在空中，需先消除下方支撑方块', rewards: { gold: 210, candy: { small: 3 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 6800 },
  { id: 41, chapter: 3, name: '收集+浮空', type: 'collect', goal: { kind: 'combo', parts: [{ kind: 'floatClear', count: 8 }, { kind: 'collect', color: 0, count: 15 }] }, steps: 22, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '浮空方块分布在不同高度', rewards: { gold: 210, candy: { small: 3 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 7000 },
  { id: 42, chapter: 3, name: '击败双风精灵', type: 'enemy', goal: { kind: 'enemy' }, steps: 28, colors: 5, enemies: [{ name: '风精灵A', hp: 3500, atk: 200, atkEvery: 1, trait: 'dodge', traitParam: { p: 0.25, reduce: 0.5 } }, { name: '风精灵B', hp: 3500, atk: 200, atkEvery: 1, trait: 'dodge', traitParam: { p: 0.25, reduce: 0.5 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '双目标+闪避', rewards: { gold: 220, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 7200 },
  { id: 43, chapter: 3, name: '限时挑战', type: 'timed', goal: { kind: 'collect', color: null, count: 30, time: 45 }, steps: 0, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '限时关：45秒内消除30个任意方块', rewards: { gold: 220, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 7400 },
  { id: 44, chapter: 3, name: '收集-纯浮空', type: 'collect', goal: { kind: 'floatClear', count: 10 }, steps: 20, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '纯浮空关卡', rewards: { gold: 220, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 7600 },
  { id: 45, chapter: 3, name: '击败雷云兽', type: 'enemy', goal: { kind: 'enemy' }, steps: 30, colors: 5, enemies: [{ name: '雷云兽', hp: 7000, atk: 280, atkEvery: 1, trait: 'lightning', traitParam: { every: 3, area: 3 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '每3回合释放"雷击"（随机消除3×3区域），与Boss风暴巨龙机制类似的前置体验', rewards: { gold: 230, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 7800 },
  { id: 46, chapter: 3, name: '云端宝箱', type: 'collect', goal: { kind: 'treasure', count: 3 }, steps: 25, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次引入云端宝箱：消除标记方块后掉落宝箱', rewards: { gold: 230, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 8000 },
  { id: 47, chapter: 3, name: '收集+宝箱', type: 'collect', goal: { kind: 'combo', parts: [{ kind: 'collect', color: 2, count: 20 }, { kind: 'treasure', count: 2 }] }, steps: 22, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '双重目标', rewards: { gold: 230, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 8200 },
  { id: 48, chapter: 3, name: '击败风暴鸦', type: 'enemy', goal: { kind: 'enemy' }, steps: 25, colors: 5, enemies: [{ name: '风暴鸦', hp: 5500, atk: 250, atkEvery: 1, trait: 'windMove', traitParam: { every: 2, count: 5 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '每2回合"卷风"（随机移动5个方块位置），位置扰动型敌人', rewards: { gold: 240, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 8400 },
  { id: 49, chapter: 3, name: '消除计分-高分', type: 'score', goal: { kind: 'score', score: 8000 }, steps: 22, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '高分关', rewards: { gold: 240, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 8600 },
  { id: 50, chapter: 3, name: '综合挑战', type: 'combo', goal: { kind: 'combo', parts: [{ kind: 'chainClear', count: 8 }, { kind: 'score', score: 6000 }] }, steps: 25, colors: 5, enemies: [], board: { ice: [], chain: rectCells(3, 2, 4, 5, { hits: 3 }), echo: [], silent: [] }, special: '锁链+高分双目标', rewards: { gold: 240, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 8800 },
  { id: 51, chapter: 3, name: '击败三风精灵', type: 'enemy', goal: { kind: 'enemy' }, steps: 30, colors: 5, enemies: [{ name: '风精灵A', hp: 4000, atk: 180, atkEvery: 1, trait: 'dodge', traitParam: { p: 0.2, reduce: 0.5 } }, { name: '风精灵B', hp: 4000, atk: 180, atkEvery: 1, trait: 'dodge', traitParam: { p: 0.2, reduce: 0.5 } }, { name: '风精灵C', hp: 4000, atk: 180, atkEvery: 1, trait: 'dodge', traitParam: { p: 0.2, reduce: 0.5 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '三目标高压关', rewards: { gold: 250, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 9000 },
  { id: 52, chapter: 3, name: '收集-大量紫色', type: 'collect', goal: { kind: 'collect', color: 3, count: 35 }, steps: 25, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '大量单色收集', rewards: { gold: 250, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 9200 },
  { id: 53, chapter: 3, name: '浮空+静音', type: 'collect', goal: { kind: 'combo', parts: [{ kind: 'floatClear', count: 5 }, { kind: 'silentClear', count: 5 }] }, steps: 22, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [{ r: 2, c: 3, layer: 1 }, { r: 2, c: 4, layer: 1 }, { r: 5, c: 3, layer: 1 }, { r: 5, c: 4, layer: 1 }, { r: 3, c: 6, layer: 1 }] }, special: '混合前两章机制', rewards: { gold: 250, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 9400 },
  { id: 54, chapter: 3, name: '击败云层巨人', type: 'enemy', goal: { kind: 'enemy' }, steps: 32, colors: 5, enemies: [{ name: '云层巨人', hp: 10000, atk: 320, atkEvery: 1, trait: 'fog', traitParam: { atHpPct: 0.6, rows: 2, dur: 2 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: 'HP低于60%时"起雾"（棋盘边缘2行不可见持续2回合），视野干扰型Boss', rewards: { gold: 260, candy: { small: 5 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 9600 },
  { id: 55, chapter: 3, name: '限时挑战-高分', type: 'timed', goal: { kind: 'score', score: 7000, time: 50 }, steps: 0, colors: 5, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '限时高分关', rewards: { gold: 260, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 9800 },
  { id: 56, chapter: 3, name: 'Boss战-风暴巨龙', type: 'boss', goal: { kind: 'enemy' }, steps: 40, colors: 5, enemies: [{ name: '风暴巨龙', hp: 20000, atk: 300, atkEvery: 1, trait: 'tornado', traitParam: { every: 2, area: 3 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: 'Boss关，推荐战力8000；每2回合释放"龙卷风"（随机清除3×3区域）', rewards: { gold: 1200, candy: { small: 5, medium: 1 }, shard: 4, shardChar: 'feitianxia' }, boss: true, unlockChar: null, power: 8000 }
];

// ===== 第四章「命运赌场」25 关（id 57-81，按文档第 18 页表格录入）=====
const CH4 = [
  { id: 57, chapter: 4, name: '消除计分', type: 'score', goal: { kind: 'score', score: 8000 }, steps: 22, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次6色棋盘（新增橙色）', rewards: { gold: 260, candy: { small: 3 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 10000 },
  { id: 58, chapter: 4, name: '收集-橙色', type: 'collect', goal: { kind: 'collect', color: 5, count: 20 }, steps: 22, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '橙色为新颜色', rewards: { gold: 260, candy: { small: 3 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 10200 },
  { id: 59, chapter: 4, name: '子方块教学', type: 'collect', goal: { kind: 'collect', color: 0, count: 15 }, steps: 20, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次引入子方块：消除后随机变为任意颜色', rewards: { gold: 270, candy: { small: 3 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 10400 },
  { id: 60, chapter: 4, name: '击败子魔', type: 'enemy', goal: { kind: 'enemy' }, steps: 28, colors: 6, enemies: [{ name: '子魔', hp: 8000, atk: 300, atkEvery: 1, trait: 'subBlock', traitParam: { every: 2, count: 3 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '每2回合将棋盘随机3个方块变为子方块，子方块增多增加随机性', rewards: { gold: 270, candy: { small: 3 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 10600 },
  { id: 61, chapter: 4, name: '收集-蓝+橙', type: 'collect', goal: { kind: 'collect', list: [{ color: 1, count: 25 }, { color: 5, count: 25 }] }, steps: 25, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '子方块可能变为目标颜色辅助完成', rewards: { gold: 270, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 10800 },
  { id: 62, chapter: 4, name: '消除计分-高分', type: 'score', goal: { kind: 'score', score: 10000 }, steps: 22, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '高分关', rewards: { gold: 280, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 11000 },
  { id: 63, chapter: 4, name: '击败双子魔', type: 'enemy', goal: { kind: 'enemy' }, steps: 30, colors: 6, enemies: [{ name: '子魔A', hp: 6000, atk: 280, atkEvery: 1, trait: 'gambleLock', traitParam: { every: 2, dur: 3, alternate: true } }, { name: '子魔B', hp: 6000, atk: 280, atkEvery: 1, trait: 'gambleLock', traitParam: { every: 2, dur: 3, alternate: true } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '交替释放"赌局"（随机锁定1种颜色3回合不可消除），颜色封锁型敌人', rewards: { gold: 280, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 11200 },
  { id: 64, chapter: 4, name: '老虎机教学', type: 'collect', goal: { kind: 'slot', count: 1 }, steps: 20, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次引入老虎机：每5回合顶部出现3个转轮，匹配成功获得道具', rewards: { gold: 280, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 11400 },
  { id: 65, chapter: 4, name: '收集+老虎机', type: 'collect', goal: { kind: 'combo', parts: [{ kind: 'collect', color: 2, count: 30 }, { kind: 'slot', count: 2 }] }, steps: 25, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '鼓励等待老虎机触发', rewards: { gold: 290, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 11600 },
  { id: 66, chapter: 4, name: '击败老虎机守卫', type: 'enemy', goal: { kind: 'enemy' }, steps: 32, colors: 6, enemies: [{ name: '老虎机守卫', hp: 12000, atk: 350, atkEvery: 1, trait: 'colorSwap', traitParam: { every: 4 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '每4回合"翻转"（将棋盘上2种颜色互换），颜色互换打乱策略', rewards: { gold: 290, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 11800 },
  { id: 67, chapter: 4, name: '赌局教学', type: 'collect', goal: { kind: 'gamble', mode: 'highRisk' }, steps: 20, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '首次引入赌局选择（可选"高风险高回报"或"普通模式"），高风险下敌人HP翻倍但奖励翻倍', rewards: { gold: 300, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 12000 },
  { id: 68, chapter: 4, name: '收集-子方块', type: 'collect', goal: { kind: 'subClear', count: 10 }, steps: 22, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '子方块需被消除后才算完成目标', rewards: { gold: 300, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 12200 },
  { id: 69, chapter: 4, name: '击败筹码骑士', type: 'enemy', goal: { kind: 'enemy' }, steps: 28, colors: 6, enemies: [{ name: '筹码骑士', hp: 10000, atk: 320, atkEvery: 1, trait: 'bet', traitParam: { every: 3, healPct: 0.05, extraDmg: 500 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '每3回合"下注"（随机押注1种颜色，消除该颜色Boss回血5%，避免则Boss受500额外伤害），与赌王机制类似的前置体验', rewards: { gold: 300, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 12400 },
  { id: 70, chapter: 4, name: '限时挑战', type: 'timed', goal: { kind: 'score', score: 8000, time: 40 }, steps: 0, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '限时关：40秒内获得8000分', rewards: { gold: 310, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 12600 },
  { id: 71, chapter: 4, name: '综合挑战', type: 'combo', goal: { kind: 'combo', parts: [{ kind: 'score', score: 8000 }, { kind: 'slot', count: 3 }] }, steps: 25, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '高分+老虎机双目标', rewards: { gold: 310, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 12800 },
  { id: 72, chapter: 4, name: '击败三子魔', type: 'enemy', goal: { kind: 'enemy' }, steps: 32, colors: 6, enemies: [{ name: '子魔A', hp: 7000, atk: 250, atkEvery: 1, trait: 'subBlock', traitParam: { every: 2, count: 2 } }, { name: '子魔B', hp: 7000, atk: 250, atkEvery: 1, trait: 'subBlock', traitParam: { every: 2, count: 2 } }, { name: '子魔C', hp: 7000, atk: 250, atkEvery: 1, trait: 'subBlock', traitParam: { every: 2, count: 2 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '每2回合将2个方块变为子方块，大量子干扰', rewards: { gold: 310, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 13000 },
  { id: 73, chapter: 4, name: '收集-橙+紫', type: 'collect', goal: { kind: 'collect', list: [{ color: 5, count: 30 }, { color: 3, count: 30 }] }, steps: 28, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '大量双色收集', rewards: { gold: 320, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 13200 },
  { id: 74, chapter: 4, name: '赌局挑战', type: 'enemy', goal: { kind: 'enemy' }, steps: 30, colors: 6, enemies: [{ name: '强化筹码骑士', hp: 20000, atk: 400, atkEvery: 1, trait: 'bet', traitParam: { every: 2, healPct: 0.05, extraDmg: 500 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '高风险模式：下注频率提升至每2回合，高风险高回报关', rewards: { gold: 320, candy: { small: 5 }, shard: 3, shardChar: null }, boss: false, unlockChar: null, power: 13400 },
  { id: 75, chapter: 4, name: '消除计分-超高分', type: 'score', goal: { kind: 'score', score: 15000 }, steps: 25, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '超高分关', rewards: { gold: 320, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 13600 },
  { id: 76, chapter: 4, name: '突破障碍-混合', type: 'collect', goal: { kind: 'combo', parts: [{ kind: 'chainClear', count: 12 }, { kind: 'silentClear', count: 8 }] }, steps: 28, colors: 6, enemies: [], board: { ice: [], chain: rectCells(1, 1, 2, 6, { hits: 3 }), echo: [], silent: rectCells(5, 2, 6, 5, { layer: 1 }) }, special: '多章机制混合', rewards: { gold: 330, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 13800 },
  { id: 77, chapter: 4, name: '击败赌场合金守卫', type: 'enemy', goal: { kind: 'enemy' }, steps: 32, colors: 6, enemies: [{ name: '赌场合金守卫', hp: 15000, atk: 380, atkEvery: 1, trait: 'allIn', traitParam: { atHpPct: 0.4, dur: 3 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: 'HP低于40%时"全押"（攻击力翻倍持续3回合），爆发型Boss', rewards: { gold: 330, candy: { small: 4 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 14000 },
  { id: 78, chapter: 4, name: '收集+限时', type: 'timed', goal: { kind: 'collect', color: null, count: 40, time: 50 }, steps: 0, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '限时大量收集：50秒内消除40个任意方块', rewards: { gold: 330, candy: { small: 4 }, shard: 1, shardChar: null }, boss: false, unlockChar: null, power: 14200 },
  { id: 79, chapter: 4, name: '击败双筹码骑士', type: 'enemy', goal: { kind: 'enemy' }, steps: 35, colors: 6, enemies: [{ name: '筹码骑士A', hp: 10000, atk: 350, atkEvery: 1, trait: 'bet', traitParam: { every: 3, healPct: 0.05, extraDmg: 500, alternate: true } }, { name: '筹码骑士B', hp: 10000, atk: 350, atkEvery: 1, trait: 'bet', traitParam: { every: 3, healPct: 0.05, extraDmg: 500, alternate: true } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: '交替下注不同颜色，双目标+颜色博弈', rewards: { gold: 340, candy: { small: 5 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 14400 },
  { id: 80, chapter: 4, name: '综合挑战-三目标', type: 'combo', goal: { kind: 'combo', parts: [{ kind: 'score', score: 12000 }, { kind: 'subClear', count: 10 }, { kind: 'slot', count: 2 }] }, steps: 28, colors: 6, enemies: [], board: { ice: [], chain: [], echo: [], silent: [] }, special: '三目标综合关', rewards: { gold: 340, candy: { small: 5 }, shard: 2, shardChar: null }, boss: false, unlockChar: null, power: 14600 },
  { id: 81, chapter: 4, name: 'Boss战-赌王·杰克', type: 'boss', goal: { kind: 'enemy' }, steps: 45, colors: 6, enemies: [{ name: '赌王·杰克', hp: 30000, atk: 350, atkEvery: 1, trait: 'bet', traitParam: { every: 1, healPct: 0.05, extraDmg: 500 } }], board: { ice: [], chain: [], echo: [], silent: [] }, special: 'Boss关，推荐战力12000，通关获得转转君；每回合"押注"1种颜色（消除该色Boss回血5%，避免则受500额外伤害）', rewards: { gold: 2000, candy: { small: 5, medium: 1 }, shard: 4, shardChar: 'zhuanzhuanjun' }, boss: true, unlockChar: 'zhuanzhuanjun', power: 12000 }
];

// ===== 第 5-7 章及隐藏章工厂生成 =====
// 文档仅提供章节概览（主题/关卡数/颜色数），按 ARCHITECTURE.md 程序化生成：
// 普通关/收集关/战斗关/Boss关交错（每章第 5/10/15/20/25 关为 Boss 关）；
// 敌人 HP≈2000×n^1.6、atk≈150×n；Boss HP≈12000×n^1.3、Boss atk≈100×n（n=章节号）；
// 步数 20-30；隐藏章每关掉全角色碎片。

const CH_BOSS_NAMES = { 5: '无聊魔王·王座形态', 6: '无聊魔王·牧场形态', 7: '无聊魔王·面馆形态', 8: '无聊魔王·终极形态' };
const CH_ENEMY_NAMES = {
  5: ['废墟卫兵', '断剑骑士', '石像守卫', '王座幽灵'],
  6: ['牧草精', '温泉龟', '奶牛虚影', '牧场守卫'],
  7: ['面汤史莱姆', '夜市灯笼怪', '辣椒小妖', '面馆学徒'],
  8: ['虚空残影', '星尘傀儡', '无聊之核', '梗灵试炼者']
};
const CH_SHARD_CHAR = { 5: 'zifengzhiwang', 6: 'xiaoniu', 7: 'mianshifu', 8: 'all' };
const CH_UNLOCK = { 5: { at: 10, char: 'zifengzhiwang' }, 6: { at: 20, char: 'xiaoniu' }, 7: null, 8: null };
const CH_POWER_START = { 5: 12500, 6: 16500, 7: 20500, 8: 25000 };

function makeChapterLevels(chapter) {
  const n = chapter.id;
  const levels = [];
  // V6 平衡：旧公式（2000*n^1.6 / 12000*n^1.3）后期血量远超玩家单回合输出预算，
  // 导致高章不可通关；改为与"每回合≈平均ATK*0.5*(3~5消除)"匹配的可通关曲线。
  const enemyHp = Math.round(420 * Math.pow(n, 1.5));
  const enemyAtk = Math.round(40 * n);
  const bossHp = Math.round(900 * Math.pow(n, 1.5));
  const bossAtk = Math.round(35 * n);
  const names = CH_ENEMY_NAMES[n];
  const unlock = CH_UNLOCK[n];
  const normalGold = 50 + n * 20;            // 普通关金币 50-200 随章节递增
  const bossGold = Math.min(2000, 500 + (n - 1) * 250); // Boss 金币 500-2000
  const shardChar = CH_SHARD_CHAR[n];

  for (let i = 1; i <= chapter.count; i++) {
    const isBoss = i % 5 === 0;
    const isHidden = n === 8;
    const type = isBoss ? 'boss' : (i % 3 === 1 ? 'collect' : i % 3 === 2 ? 'score' : 'enemy');
    const steps = isBoss ? 30 : 20 + (i % 6); // 20-30 步
    const power = Math.round(CH_POWER_START[n] + (i / chapter.count) * 4000);

    let goal;
    if (isBoss) goal = { kind: 'enemy' };
    else if (type === 'collect') goal = isHidden
      ? { kind: 'collect', color: i % 7, count: 20 + (i % 3) * 5 }
      : { kind: 'collect', color: (i + n) % chapter.colors, count: 18 + (i % 4) * 4 };
    else if (type === 'score') goal = { kind: 'score', score: 6000 + i * 500 + n * 1000 };
    else goal = { kind: 'enemy' };

    const enemies = isBoss
      ? [{ name: CH_BOSS_NAMES[n], hp: bossHp, atk: bossAtk, atkEvery: 1, trait: 'none' }]
      : type === 'enemy'
        ? [{ name: names[i % names.length], hp: enemyHp + i * 200, atk: enemyAtk, atkEvery: 1, trait: 'none' }]
        : [];

    const rewards = {
      gold: isBoss ? bossGold : normalGold + (i % 4) * 10,
      candy: { small: 3 + (i % 3) }, // 每关小糖果 3-5
      // Boss 掉碎片 3-5，普通关 1-2；隐藏章每关掉全角色碎片 3-5
      shard: (isBoss || isHidden) ? 3 + (i % 3) : 1 + (i % 2),
      shardChar
    };
    if (isBoss) rewards.candy.medium = 1;

    levels.push({
      id: chapter.startId + i - 1,
      chapter: n,
      name: isBoss ? `Boss战-${CH_BOSS_NAMES[n]}` : `${chapter.name}-${i}`,
      type,
      goal,
      steps,
      colors: chapter.colors,
      enemies,
      board: { ice: [], chain: [], echo: [], silent: [] },
      special: isHidden
        ? (isBoss ? '隐藏章Boss关，极限挑战' : '隐藏章：每关掉落全角色碎片')
        : isBoss ? 'Boss关' : '',
      rewards,
      boss: isBoss,
      unlockChar: unlock && i === unlock.at ? unlock.char : null,
      power
    });
  }
  return levels;
}

// ===== 拼接最终 LEVELS：第 1-4 章精确录入 + 第 5-8 章工厂生成 =====
const CHAPTER5 = makeChapterLevels(CHAPTERS[4]);
const CHAPTER6 = makeChapterLevels(CHAPTERS[5]);
const CHAPTER7 = makeChapterLevels(CHAPTERS[6]);
const CHAPTER8 = makeChapterLevels(CHAPTERS[7]);

export const LEVELS = [...CH1, ...CH2, ...CH3, ...CH4, ...CHAPTER5, ...CHAPTER6, ...CHAPTER7, ...CHAPTER8];
