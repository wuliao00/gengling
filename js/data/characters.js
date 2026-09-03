// characters.js — 《梗灵大陆》7 角色数值 / 技能 / 共鸣（只读常量，严格按 gengling_req2.txt）
// 结构严格按 ARCHITECTURE.md 第 3 节。
// skill.effect 关键字约定：
//   clearRow     清除一整行（哈基喵 / 小牛冲刺行）
//   clearArea2   以棋盘中心 3×3 爆破（等价 clearArea(4,4,1)）（大狗旺）
//   clearCol     清除一整列（飞天侠）
//   random       命运转盘随机结果（转转君，见 wheel 字段）
//   randomClear  随机消除 n 个方块（自封之王）
//   convertColor 全场变同色持续 2 回合（面师傅）
// passive.effect 关键字：heal / chanceStun / none(探索) / chanceHalf / rage / teamBuff / levelHeal

export const CHARACTERS = [
  {
    id: 'hajimiao', name: '哈基喵', role: '辅助型', emoji: '🐱',
    quote: ['哈', '哈基哈基~'],
    desc: '圆头圆脑的橘色小猫，大眼睛，表情呆滞，头顶飘着蜂蜜罐图标。走路摇摇晃晃，动不动就"哈"地打哈欠。',
    base: { hp: 800, atk: 120, mult: 1.0 },
    max: { hp: 2400, atk: 480, mult: 1.8 },
    perLevel: { hp: 55.2, atk: 12.4 }, // (满级-初始)/29，引擎线性插值
    skill: {
      name: '蜂蜜冲击波', cd: 4, dmgMult: 2.5, effect: 'clearRow',
      desc: '清除一整行（8格），对锁定敌人造成ATK×250%伤害。满级后额外清除上下相邻行各1格。'
    },
    passive: {
      name: '慵懒回甘', effect: 'heal', value: 0.05, maxValue: 0.10,
      desc: '每3回合自动回复全队5%HP（满级10%）。'
    },
    awaken: {
      name: '蜂蜜风暴', effect: 'clearColor', dmgMult: 1, bonusPerCell: 200,
      desc: '清除全部蜂蜜色方块，每消除1个额外造成200点伤害。'
    },
    favoriteGift: '蜂蜜罐', normalGift: '小鱼干'
  },
  {
    id: 'dasangwang', name: '大狗旺', role: '输出型', emoji: '🐶',
    quote: ['汪！大——叫！', '注意——音量！'],
    desc: '圆滚滚的黄色柴犬，嘴巴永远张得巨大，露出两颗小虎牙，脖子上挂着喇叭。嗓门极大，一开口就把周围方块震碎。',
    base: { hp: 600, atk: 200, mult: 1.2 },
    max: { hp: 1800, atk: 800, mult: 2.0 },
    perLevel: { hp: 41.4, atk: 20.7 },
    skill: {
      name: '声波咆哮', cd: 5, dmgMult: 3.0, effect: 'clearArea2', // 中心3×3 = clearArea(r,c,1)
      desc: '以棋盘中心3×3范围爆破所有方块，对锁定敌人造成ATK×300%伤害。满级后范围扩大至5×5。'
    },
    passive: {
      name: '震慑怒吼', effect: 'chanceStun', value: 0.40, maxValue: 0.65, stunTurns: 1,
      desc: '每次释放技能后，40%概率（满级65%）使敌人"震慑"1回合。'
    },
    awaken: {
      name: '全场静音', effect: 'aoeStun', dmgMult: 2.0, stunTurns: 2,
      desc: '对所有敌人造成ATK×200%伤害，并强制震慑全部敌人2回合。'
    },
    favoriteGift: '迷你喇叭', normalGift: '骨头饼干'
  },
  {
    id: 'feitianxia', name: '飞天侠', role: '探索型+输出', emoji: '🦸',
    quote: ['看好了——我飞！', '中国人能飞！'],
    desc: '穿红色斗篷的小人，斗篷印星星图案，表情自信又中二，脚底踩两团小火焰。总觉得自己能飞，其实只能跳很高。',
    base: { hp: 700, atk: 160, mult: 1.1 },
    max: { hp: 2100, atk: 640, mult: 1.9 },
    perLevel: { hp: 48.3, atk: 16.6 },
    skill: {
      name: '飞天冲击', cd: 4, dmgMult: 2.8, effect: 'clearCol',
      desc: '清除一整列（8格），对锁定敌人造成ATK×280%伤害。满级后清除左右相邻列各1格。'
    },
    passive: {
      name: '飞行探索', effect: 'none',
      desc: '在RPG地图中解锁"高台"区域，可发现隐藏宝箱。'
    },
    awaken: {
      name: '自由落体', effect: 'clearCols3', dmgMult: 2.0,
      desc: '从棋盘顶部到底部，随机清除3列，每列对随机敌人造成ATK×200%伤害。'
    },
    favoriteGift: '星星斗篷碎片', normalGift: '能量饮料'
  },
  {
    id: 'zhuanzhuanjun', name: '转转君', role: '运气型', emoji: '🤖',
    quote: ['中奖概率倍儿高！', '转一转，转一转~'],
    desc: '圆滚滚的机器人，脑袋是彩色转盘，表情永远在笑，身上挂小彩旗。赌徒心态，技能效果全靠随机。',
    base: { hp: 500, atk: 100, mult: 0.8 },
    max: { hp: 1500, atk: 400, mult: 1.5 },
    perLevel: { hp: 34.5, atk: 10.3 },
    skill: {
      name: '命运转盘', cd: 4, dmgMult: 0, effect: 'random', // 文档未标明CD，取4回合
      wheel: [ // 概率均等
        { key: '大吉', p: 0.25, dmgMult: 4.0, action: 'sameColorBlast', desc: '清除全部同色方块，ATK×400%伤害' },
        { key: '小吉', p: 0.25, dmgMult: 2.0, action: 'clearArea5', desc: '清除随机5×5范围，ATK×200%伤害' },
        { key: '大凶', p: 0.25, dmgMult: 0, action: 'none', desc: '啥也没发生，跳过' },
        { key: '逆转', p: 0.25, dmgMult: 0, action: 'shuffle', desc: '将棋盘全部方块随机打乱重排' }
      ],
      maxWheel: { key: '超级大吉', p: 0.20, action: 'clearAll', desc: '满级新增：清除全部方块，秒杀非Boss敌人' },
      desc: '随机触发（概率均等）：大吉(25%)清除全部同色方块ATK×400%伤害；小吉(25%)清除随机5×5范围ATK×200%伤害；大凶(25%)啥也没发生跳过；逆转(25%)将棋盘全部方块随机打乱重排。满级后新增超级大吉(20%)清除全部方块秒杀非Boss敌人。'
    },
    passive: {
      name: '赌徒直觉', effect: 'chanceHalf', value: 0.20, maxValue: 0.35,
      desc: '商店购买商品时20%概率（满级35%）触发"半价"。'
    },
    awaken: {
      name: '命运终局', effect: 'forcedLucky', cost: { hpTo: 1 },
      desc: '强制触发"大吉"或"超级大吉"效果，但使用后自身HP降至1。'
    },
    favoriteGift: '幸运硬币', normalGift: '子挂件'
  },
  {
    id: 'zifengzhiwang', name: '自封之王', role: '坦克+狂战士', emoji: '👑',
    quote: ['我可是……曾经的king！', '跪下！'],
    desc: '穿黑色背心的壮硕小人，头上歪歪扭扭戴着纸糊王冠，手里拿玩具剑，表情严肃又搞笑。坚信自己是传说中的王者，其实战斗力一般。',
    base: { hp: 1200, atk: 140, mult: 1.0 },
    max: { hp: 3600, atk: 560, mult: 1.7 },
    perLevel: { hp: 82.8, atk: 14.5 },
    skill: {
      name: '王者气场', cd: 4, dmgMult: 2.2, effect: 'randomClear', count: 8, maxCount: 12,
      desc: '全场方块闪烁金光2秒后随机消除8个方块，对锁定敌人造成ATK×220%伤害。满级后消除数量提升至12个。'
    },
    passive: {
      name: '王者的骄傲', effect: 'rage', value: 0.30, maxValue: 0.80, thresholds: [0.5, 0.25],
      desc: 'HP低于50%时ATK+30%，低于25%时ATK+60%（满级+80%）。'
    },
    awaken: {
      name: '孤王降临', effect: 'lastStand', dmgMult: 5.0, triggerHpPct: 0.10, oncePerBattle: true,
      desc: 'HP低于10%时自动触发，清除全场方块，对全部敌人造成ATK×500%伤害（每场战斗仅触发一次）。'
    },
    favoriteGift: '金色王冠贴纸', normalGift: '黑色头巾'
  },
  {
    id: 'xiaoniu', name: '小牛', role: '召唤型+团队增益', emoji: '🐮',
    quote: ['妈妈……', '~来！'],
    desc: '圆嘟嘟的小奶牛，身上有粉色斑点，大眼睛水汪汪，永远在找妈妈。胆小黏人，但关键时刻会爆发出惊人力量。',
    base: { hp: 750, atk: 150, mult: 1.1 },
    max: { hp: 2250, atk: 600, mult: 1.8 },
    perLevel: { hp: 51.7, atk: 15.5 },
    skill: {
      name: '——来！', cd: 4, dmgMult: 2.6, effect: 'clearRow', // 3头小牛虚影从左至右冲刺，沿途整行消除
      count: 3, maxCount: 5,
      desc: '召唤3头小牛虚影从棋盘左侧冲至右侧，沿途所有方块消除，对锁定敌人造成ATK×260%伤害。满级后小牛数量提升至5头，且可斜向冲锋。'
    },
    passive: {
      name: '妈妈的力量', effect: 'teamBuff', value: 0.15, maxValue: 0.25, minTeamSize: 2,
      desc: '队伍中有2个及以上角色时，全队ATK+15%（满级+25%）。好感度满后解锁"牛妈妈"临时召唤物。'
    },
    awaken: {
      name: '万牛奔腾', effect: 'clearAll', dmgMult: 3.5,
      desc: '召唤10头牛从四个方向同时冲入棋盘，清除全部方块，对全部敌人造成ATK×350%伤害。'
    },
    favoriteGift: '粉色蝴蝶结', normalGift: '新鲜牧草'
  },
  {
    id: 'mianshifu', name: '面师傅', role: '治疗型+辅助', emoji: '🍜',
    quote: ['来碗面？', '忘情……不放眼泪。'],
    desc: '戴厨师帽的圆脸小人，背着巨大锅，锅里永远冒着热气，围裙上写着"忘情"。沉默寡言，但做的面能治愈一切。',
    base: { hp: 650, atk: 100, mult: 0.9 },
    max: { hp: 1950, atk: 400, mult: 1.6 },
    perLevel: { hp: 44.8, atk: 10.3 },
    skill: {
      name: '忘情一碗面', cd: 5, dmgMult: 1.5, effect: 'convertColor', duration: 2, maxDuration: 3,
      desc: '将棋盘上所有方块变为同一种颜色（随机选择），持续2回合。对锁定敌人造成ATK×150%伤害。满级后持续时间延长至3回合。'
    },
    passive: {
      name: '暖胃治愈', effect: 'levelHeal', value: 0.15, maxValue: 0.25,
      desc: '每通过一个关卡，全队恢复15%HP（满级25%）。'
    },
    awaken: {
      name: '忘情全席', effect: 'convertAll', dmgMult: 3.0, healPct: 0.30,
      desc: '将棋盘全部方块变为同色，并立即触发一次全场消除，对全部敌人造成ATK×300%伤害，全队回复30%HP。'
    },
    favoriteGift: '秘制调料包', normalGift: '手工围裙'
  }
];

// 共鸣组合（7条，严格按文档第三节）
export const RESONANCES = [
  { id: 'catdog', name: '猫狗双全', chars: ['hajimiao', 'dasangwang'], effect: 'blastAdjacent', desc: '消除时额外爆破周围1格' },
  { id: 'skybet', name: '天上赌局', chars: ['feitianxia', 'zhuanzhuanjun'], effect: 'forceLucky', desc: '转转君技能必定触发大吉' },
  { id: 'kingranch', name: '王者牧场', chars: ['zifengzhiwang', 'xiaoniu'], effect: 'rageThresholdDouble', desc: '王者骄傲阈值翻倍' },
  { id: 'warmcat', name: '暖胃猫', chars: ['mianshifu', 'hajimiao'], effect: 'healPerTurn', value: 0.08, desc: '每回合自动回复8%HP' },
  { id: 'roarkingship', name: '怒吼王权', chars: ['dasangwang', 'zifengzhiwang'], effect: 'skillDmgUp', value: 0.50, desc: '技能伤害+50%' },
  { id: 'beefnoodle', name: '牛肉面套餐', chars: ['mianshifu', 'xiaoniu'], effect: 'freeItem', desc: '每关开始自动获得1个道具' },
  { id: 'skycat', name: '天空之猫', chars: ['feitianxia', 'hajimiao'], effect: 'cdReduce', value: 1, desc: '技能CD全部-1' }
];
