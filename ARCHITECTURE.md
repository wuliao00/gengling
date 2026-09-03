# 《梗灵大陆》H5 版 — 架构与接口规范（所有开发者必读）

> ⚔️ V2 增补（见文件底部「V2 增补」章节）：三/四章棋盘机制、逐角色 HP、Boss 技能、特效 API、渲染性能精灵缓存、Q版立绘、世界地图。新代码以 V2 为准。

目标：三消+RPG 解压游戏 MVP。纯 ES Modules，无构建工具，无外部依赖，无 DOM 依赖的逻辑层。
美术用 Canvas 绘制的呆萌卡通风格（不引入外部图片资源），角色可用代码绘制的圆脸+特征装饰。

## 目录结构

```
gengling/
  index.html          # 单页入口
  css/game.css        # 全部样式（移动端竖屏优先，390px 设计稿）
  js/
    core/
      rng.js          # 可注入种子的随机数
      board.js        # 三消棋盘纯逻辑（无 DOM、无 Canvas）
    data/
      characters.js   # 7 角色数值/技能/共鸣
      levels.js       # 章节+关卡配置
      items.js        # 道具与商店
    game/
      save.js         # localStorage 存档（适配层，便于迁到 wx.setStorage）
      meta.js         # 体力/金币/进度/养成（升级升星碎片好感度）
      battle.js       # 战斗流程（回合、伤害、敌人 AI）
      skills.js       # 角色技能实现（操作 board 产生 events）
    ui/
      render.js       # 棋盘 Canvas 渲染 + 动画（唯一的 canvas 绘制者）
      input.js        # 触摸/鼠标输入（滑动交换）
      scenes.js       # DOM 场景切换：home/map/lineup/battle/chars/shop/result
    main.js           # 启动与粘合
  tests/engine.test.mjs
```

## 全局约定

- ES Modules（`import/export`）。逻辑层文件禁止引用 `document/window`（save.js 除外，须判空降级）。
- 棋盘坐标 `r`(行 0-7, 上→下), `c`(列 0-7, 左→右)。
- 颜色索引 0-6：0红 1蓝 2绿 3黄 4紫 5橙 6彩虹专用色(仅特殊方块)。
- 特殊方块 `special`: `null | 'rowBomb' | 'colBomb' | 'rainbow'`（rowBomb 清整行，colBomb 清整列，rainbow 交换时清全同色）。

## 1. js/core/rng.js

```js
export class RNG { constructor(seed=Date.now()%2**31); next(); /* [0,1) */ int(n); /* [0,n) */ pick(arr); shuffle(arr); }
```

## 2. js/core/board.js — 三消引擎（纯逻辑）

```js
export class Board {
  constructor(opts)
  // opts: { rows=8, cols=8, colors=4, rng, seedCells:{ice:[{r,c,hp(1|2)}], chain:[{r,c,hits(3)}]}, noInitialMatches=true }
  grid: Cell[][]            // Cell = { color:int, special:string|null, ice:int, chain:int }
  swap(r1,c1,r2,c2) -> MoveResult | null   // 非法交换返回 null（含锁定/不相邻/无匹配且无特殊效果）
  useHint()                 // 返回一个可行交换 {r1,c1,r2,c2} 或 null
  // ===== 技能用的原子操作（均返回 Event[]，需处理连锁与重力）=====
  clearCells(cells)         // [{r,c}] 强制消除（无视 chain 但会打 ice）
  clearRow(r); clearCol(c); clearArea(r,c,rad)  // rad=1 即 3×3
  convertColor(fromColor,toColor)  // 全场变色
  shuffleAll()
  randomCells(n)            // 随机取 n 个非特殊格子
}
// MoveResult = { events: Event[], score: number, matchedCounts: {colorIdx:count}, specialCreated: Cell|null, moves: number /*连锁数*/ }
// Event（渲染与战斗消费，按发生顺序）:
//  {type:'swap', cells:[{r,c,color,ice,chain}, ...]}
//  {type:'invalid'}
//  {type:'match', cells:[{r,c,color,special}], score, chainIndex}   // chainIndex 从 0 递增
//  {type:'specialSpawn', r, c, kind}
//  {type:'fall', moves:[{from:{r,c}, to:{r,c}, cell}]}              // 整轮掉落一次
//  {type:'refill', cells:[{r,c,cell}]}                              // 顶部补充
//  {type:'iceBreak', r, c, hp}   {type:'chainOpen', r, c}
//  {type:'bomb', r, c, kind, cleared:[...]}
//  {type:'rainbow', r, c, color, cleared:[...]}
```

规则要点：3 连即消；4 连生成炸弹（横向 4 连→colBomb 或按交换方向，二选一，写死一种即可）；5 连/十字→rainbow；每轮全部匹配+炸弹+彩虹结算完后统一重力掉落+顶部补充，再检测连锁，直到无匹配；ice 覆盖格被"消除波及"（本格或相邻格参与匹配）时 ice-1；chain 格不可交换不可被消除，相邻格参与匹配时 chain-1，归零解锁；每回合顶部掉落新方块由 swap 驱动（不需要外部 tick）。

## 3. js/data/* — 数据（只读常量，结构必须严格一致）

```js
// characters.js
export const CHARACTERS = [{ id:'hajimiao', name:'哈基喵', role:'辅助型', quote:'', emoji:'🐱',
  base:{ hp:800, atk:120, mult:1.0 }, max:{ hp:2400, atk:480, mult:1.8 },
  perLevel:{ hp:35, atk:11 },                 // 每级成长（引擎按线性插值）
  skill:{ name:'蜂蜜冲击波', cd:4, desc:'', dmgMult:2.5, effect:'clearRow' },
  passive:{ name:'慵懒回甘', desc:'', effect:'heal', value:0.05 },
  awaken:{ name:'蜂蜜风暴', desc:'', dmgMult:1, effect:'clearColor' },
  favoriteGift:'蜂蜜罐', normalGift:'小鱼干' }, ...7个]
export const RESONANCES = [{ id, name:'猫狗双全', chars:['hajimiao','dasangwang'], effect:'blastAdjacent', desc:'' }, ...7个]
// 7角色 id: hajimiao dasangwang feitianxia zhuanzhuanjun zifengzhiwang xiaoniu mianshifu
```
数值/技能描述严格按需求文档（全文在 `../gengling_req2.txt`，用 grep 查"哈基喵""共鸣""道具"等段落）。effect 关键字可用：clearRow/clearCol/clearArea3/clearArea2/clearColor/shuffle/randomClear/sameColorBlast。被动 effect：heal/rage/chanceHalf/aoeBoost/shieldStart/attackBuff/revive。

```js
// levels.js
export const CHAPTERS = [{ id:1, name:'梗灵觉醒', theme:'草原/村庄', count:15, colors:4, unlock:null }, ...隐藏章 8]
export const LEVELS = [ // 第1章15关+第2章20关按文档逐关精确录入；第3-7章及隐藏章用 makeLevels() 程序化生成同样结构
 { id:1, chapter:1, name:'教学-消除', type:'collect',        // collect|score|enemy|timed|boss|combo
   goal:{ kind:'collect', color:0, count:10 },               // 或 {kind:'score',score:800} 或 {kind:'enemy'} 或 {kind:'timed',score:3000,time:60} 或 combo:{score, collect, chains, treasures...}
   steps:15, colors:4,
   enemies:[],                       // [{name, hp, atk, atkEvery:1, trait:'none|shell|dodge|summon', traitParam}]
   board:{ ice:[], chain:[], echo:[], silent:[] },
   tutorial:'消除10个红色方块',       // 有则开战前弹教学气泡
   rewards:{ gold:80, candy:{small:3}, shard:2, shardChar:null }, // shardChar null=随机
   boss:false, unlockChar:null,      // 第1/5/10关解锁角色填 id
   power:200 }
]
```
第一章数值必须与文档一致（史莱姆 500/80、中史莱姆 1200/120、双史莱姆 1000×2/100、Boss 5000/100 等）。第 2-7 章敌人/关卡数按章节概览表程序化：第 n 章敌人 HP ≈ 2000×n^1.6，atk ≈ 150×n，Boss HP ≈ 12000×n^1.3。

```js
// items.js
export const ITEMS = { hammer:{name:'锤子',price:50,dailyLimit:10,desc:'消除指定1个方块'},
  crossBomb:{name:'十字炸弹',price:120,...}, colorBottle:{...200}, extraSteps:{...300}, shield:{...80},
  candyS:{...30}, candyM:{...150}, candyL:{...600}, skillBook:{...400} }
export const GIFTS = { 蜂蜜罐:{price:200}, ... }
```

## 4. js/game/* — 元系统

```js
// save.js
export const Save = {
  load() -> saveObj|null, save(obj), reset(),
  DEFAULT: { gold:500, energy:20, energyTs:0, steps:0 /*总步数成就用*/,
    unlockedLevels:1, levelStars:{}, progress:{},
    chars:{ hajimiao:{ unlocked:true, level:1, exp:0, star:0, shards:0, favor:1, favorExp:0, skillLv:1 } ...},
    items:{hammer:2, crossBomb:1, colorBottle:0, extraSteps:1, shield:1},
    team:['hajimiao',null,null], pity:{}, achievements:{}, lastShardFail:0 }
}
// meta.js
export const Meta = {
  init(); get(); save();
  addGold(n); spendGold(n)->bool;
  energy: { get(), cost(n)->bool, regen() /* 5min/点，上限30，按时间戳结算 */ }
  completeLevel(levelId, stars, stats) -> { rewards, levelUps, unlocks }  // 发金币/糖果/碎片+保底+解锁下一关
  failLevel(levelId)      // 扣体力 2(普通)/3(Boss)
  charPower(charId) -> HP/ATK/mult 当前值; teamPower();
  addExp(charId, exp); addShard(charId, n); unlockChar(id);
  levelUpCost(shards) // 解锁30碎片，1→2星20，2→3星40，3→4星60，4→5星100
  expTable: 等级1→30 经验曲线（文档有表，用线性近似 [100,150,200,280,380,500,650,820,1000,1250,1500,1800,2100,2500,3000,3500,4000,4600,5200,6000,6800,7700,8600,9600,11000,12500,14000,15800,18000]）
}
// battle.js — 战斗状态机（无 DOM，board 由外部传入）
export class Battle {
  constructor(level, teamChars /*[{id, hp, atk, mult, skill...}]*/, board, rng)
  state: { hp, maxHp, shield, enemies:[{name,hp,maxHp,atk,...}], turn, skillCds:{}, logs:[], over:false, win:false }
  onMoveResult(moveResult)  // 每次玩家有效交换后调用：结算伤害→敌人行动→被动→胜负
  useSkill(charIdx)         // CD 检查→skills.js 执行→敌人行动
  useItem(item, target)     // 战斗内道具
}
// 伤害模型：每个被消除方块伤害 = 队伍平均ATK × 0.5 × (1+0.15×连锁数)；技能伤害 = 出技能者ATK×dmgMult。
// 玩家队伍共享 HP = Σ出战角色HP。敌人每 atkEvery 回合按 atk 打玩家；护盾抵一次。
// 3星评价：剩余步数≥5→3星, 2-4→2星, 1→1星（timed 关按剩余时间%）
// skills.js: export function castSkill(skill, ctx) // ctx={board,battle,events→数组}；把技能效果转成 board 原子操作+伤害
```

## 5. js/ui/* — 界面（DOM 菜单 + 单个 canvas 棋盘）

场景（`<div class="scene">` 切换，移动端竖屏、`100dvh`、禁双击缩放）：
1. **home**：标题 LOGO（canvas 画呆萌字）、开始按钮、体力/金币栏、签到入口占位
2. **map**：章节横滑 + 关卡节点（已通关显示星星）、章节宝箱按钮、锁定章显示解锁条件
3. **lineup**：战前界面 — 关卡信息/推荐战力/教学文案、角色选择 3 格（未解锁置灰显示碎片进度）、道具勾选、开战
4. **battle**：顶部敌人区（canvas 画呆萌敌人+血条+表情变化）、棋盘 canvas（居中方形，约 92vw）、底部技能/道具栏 + 剩余步数/目标进度/暂停
5. **result**：胜利（星星动画+奖励列表+失败差一点文案）/失败（"差 XX 分通关"等复盘提示+免费重试）
6. **chars**：角色列表→详情（canvas 立绘、升级/升星/技能、好感度条、共鸣说明）
7. **shop**：常驻/每日特惠两个 tab，金币价格与限购，购买 toast

render.js：requestAnimationFrame 动画队列消费 Board events（消除爆裂缩放、掉落补间、炸弹闪光、彩虹球旋转、伤害飘字、屏幕微震）。方块=圆角方块+呆萌表情（canvas 画），颜色按索引。input.js：pointerdown/up 计算滑动方向触发 swap，点击技能/道具后进入目标选择模式（高亮可选格）。

## 6. main.js 粘合流程

启动→Save.load→Meta.init→场景 home。选关→lineup→开始→new Board(level)+new Battle→rAF 循环：input swap→board.swap→battle.onMoveResult→render 播放 events→检查 goal/over→result。战前扣 1 体力（不足提示去商店/等待），失败 Meta.failLevel，胜利 Meta.completeLevel。

## 7. 验收基线（集成者会用它测）

- `node tests/engine.test.mjs` 全绿：初始无匹配、合法/非法交换、3消/4连炸弹/5连彩虹、连锁、掉落后满格、ice/chain 消耗
- 手机 Chrome 打开：竖屏布局无溢出、滑动交换流畅（>30fps）、教学关可引导、Boss 关技能可释放、胜利结算/失败重试闭环、存档刷新不丢

---

# V2 增补 — 本轮迭代接口（所有开发者必读）

## V2.1 board.js 新增（引擎，TDD：先写失败测试再实现）

```js
// seedCells 新增：{ float:[{r,c}], treasure:[{r,c}], sub:[{r,c}] }
// Cell 新增字段：float:bool, treasure:bool, sub:bool（sub 格 color=-1 通配）
applyWind(n=3)            // 气流：随机 1 列顶部 n 格被吹走（不计分不计数），走重力+补充
                          // 返回 events 追加 {type:'wind', col, cleared:[...]}
// float 浮空格：不参与重力（悬空固定，同 chain 规则），可正常匹配消除；
//   被消除时发 {type:'floatDrop', r, c}（floatClear 目标计数用）
// treasure 宝箱格：普通颜色+宝箱标记，被消除时发 {type:'treasure', r, c}（treasure 目标计数）
// sub 子方块：color=-1，匹配检测时与任意同色 run 兼容（取该 run 主色计 matchedCounts）；
//   单独两个 sub+1 个普通色也可成 3 连；被消除发普通 match 事件（color 记 run 主色）
// useHint 需考虑 sub 通配；shuffleAll 后需保证无匹配
```

## V2.2 battle.js 改造（逐角色 HP + Boss 技能，TDD）

```js
// 逐角色 HP（取代共享 HP）：
// state.members = [{id, name, hp, maxHp, fainted}]（由 teamChars hp 生成）
// 敌人攻击：随机命中一名未倒下成员；成员 hp≤0 → fainted（技能不可用，被动失效）
// 全员倒下 → 战败。heal：治疗所有存活成员各 n（平分或全额，实现取全额）
// rage/attackBuff 等按存活成员计算；avgAtk 只算存活者
// 兼容：state.hp/maxHp 保留 = Σ成员hp（血条兜底用）
useSkill(charIdx)         // fainted 或 cd>0 返回 {ok:false, reason}
// ===== Boss 技能（敌人 trait 字段驱动，每 traitEvery 回合触发）=====
// trait: 'shell'(减伤50%持续1回合, traitEvery) | 'rockfall'(封锁随机1行R回合→state.rowLocks)
//   | 'noise'(随机2行静音R回合→rowLocks) | 'tornado'(清随机3×3，不伤害玩家)
//   | 'gust'(随机移动5个方块→shuffle 部分) | 'fog'(边缘2行不可见R回合→state.fogTurns)
//   | 'thunder'(随机3×3消除) | 'bet'(押注1色，消除该色回血5%否则受500伤→battle.betColor)
//   | 'sub_convert'(随机3格变子方块) | 'allin'(HP<40% 攻击翻倍3回合) | 'summon'(召唤小怪→enemies.push)
// 敌人减伤：e.shieldTurns>0 时受到伤害减半
// 押注：battle.playerClearsColor(color, n) 由 main 在每次 moveResult 后调用（bet 判定）
// 每回合行为记录 this.turnEvents = [{kind:'enemyAttack',enemy:i,target,dmg},
//   {kind:'bossSkill',enemy:i,trait,name}, {kind:'memberFainted',idx}, ...] 供 UI 播动画
// state.slotCounter：每 +1 回合（老虎机 UI 每 5 回合触发）
```

## V2.3 render.js 性能 + 特效 API

```js
// 性能（滑动卡顿根因）：精灵缓存 —— 每种 (color,variant,ice,chain,special) 组合
// 预渲染到离屏 canvas（尺寸 cs×dpr），主循环只 drawImage；resize/attach 时重建。
// 禁止每帧 createLinearGradient / 大量 path。动画时长整体缩短 30%，同帧事件并行播放。
// ===== 特效 API（main 消费）=====
playFx(kind, opts)        // 统一特效入口，返回 Promise：
//  'skillCast', charId      队友头像金光+棋盘按技能色闪光（row=蓝、col=蓝、area=紫…）
//  'bossSkill', name        全屏红闪+震动+Boss 名字大字飘出
//  'enemyAttack', idx       敌人卡向前猛冲回弹（CSS class 也行）
//  'treasure', r,c          宝箱金光喷泉
//  'wind', col              气流线条从上往下扫过该列
//  'fog', on/off            边缘雾气半透明遮罩
//  'rowLock', rows[]        被封锁行灰色锁链覆盖
floatText(text, x, y, cls) // 伤害/回复飘字（画布内绘制，不再用 DOM）
```

## V2.4 drawAvatar Q 版重绘 + 地图场景

```js
drawAvatar(ctx, charId, x, y, size)   // 重绘为高细节 Q 版(chibi)：
// 头身比 ~1:1，深色描边(2px)，径向渐变上色，大玻璃眼(双眼高光+下睫毛)，
// 眉毛/腮红/牙齿/舌细节，服装纹样与道具（蜂蜜罐/喇叭/斗篷星星/转盘/纸王冠/粉斑/厨师帽锅），
// 站姿小手小脚，脚下椭圆软阴影，可传 opts={pose:'idle'|'attack'|'happy'}
drawAvatarAnim(canvas, charId, size)  // 详情页用：眨眼+呼吸起伏循环（rAF，返回 stop()）
// scenes.render_map 重写为世界地图：
// 每章一条蜿蜒虚线路径（canvas 画），关卡节点=路径上的圆形按钮（已通关显示星，
// Boss 节点更大+皇冠），当前进度节点高亮脉冲+哈基喵小立绘站在旁边，
// 章节主题背景（草原绿/峡谷褐/云端蓝/赌场紫红/废墟灰/牧场粉/面馆暖橙/星空深蓝，渐变+装饰图形）
// 节点坐标按关卡序号沿正弦曲线分布，支持纵向滚动
```

## V2.5 main.js 接线（集成者负责）

- 战斗底部改 3 个成员头像+各自血条（fainted 灰暗），敌人攻击时对应成员受击动画
- turnEvents 逐个播放：bossSkill 特效 → enemyAttack 冲撞+成员闪红
- 逐回合后 `slotCounter%5==0` 且关卡带老虎机机制 → 老虎机弹窗（3 转轮 CSS 动画，2 连中小奖励 3 连大奖励，goal.slot 计数）
- 赌局关开战前弹模式选择（普通 / 高风险：敌人 HP×2、金币×2），Meta.completeLevel(stats.highRisk) 金币翻倍
- 气流：每 2 回合 board.applyWind() 并播放 wind 特效；float/treasure/sub 进度接入 _goalDone
- rowLocks 行锁定期间 input 拒绝对该行 swap；fog 期间渲染雾气
