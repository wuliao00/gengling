// items.js — 《梗灵大陆》道具 / 糖果 / 技能书 / 礼物（只读常量）
// 价格与每日限购严格按 ARCHITECTURE.md 第 3 节与需求文档 5.1 常驻商店表。

export const ITEMS = {
  hammer:     { name: '锤子',       price: 50,  dailyLimit: 10, desc: '消除指定1个方块' },
  crossBomb:  { name: '十字炸弹',   price: 120, dailyLimit: 5,  desc: '消除指定方块所在行列' },
  colorBottle:{ name: '颜色转换瓶', price: 200, dailyLimit: 3,  desc: '将全场指定颜色变为另一种颜色' },
  extraSteps: { name: '额外5步',    price: 300, dailyLimit: 2,  desc: '增加5步操作机会' },
  // ===== 梗之护盾（分级减伤，削弱旧版"完全格挡"；shieldReduce = 受击时减免的伤害比例）=====
  shield:        { name: '梗之护盾·Pro Mini', price: 80,  dailyLimit: 5, desc: '抵消一次攻击的50%伤害', shieldReduce: 0.5 },
  shieldMax:     { name: '梗之护盾·Max',      price: 160, dailyLimit: 5, desc: '抵消一次攻击的70%伤害', shieldReduce: 0.7 },
  shieldProMax:  { name: '梗之护盾·Pro Max',  price: 280, dailyLimit: 4, desc: '抵消一次攻击的85%伤害', shieldReduce: 0.85 },
  shieldUltra:   { name: '梗之护盾·Ultra',    price: 450, dailyLimit: 3, desc: '完全抵消一次攻击（100%减伤）', shieldReduce: 1.0 },
  // V5：体力补给
  energyPotion: { name: '能量瓶',   price: 150, dailyLimit: 5,  desc: '使用后立即恢复10点体力' },
  // 糖果（经验）
  candyS:     { name: '小糖果',     price: 30,  dailyLimit: 20, desc: '100 EXP', exp: 100 },
  candyM:     { name: '中糖果',     price: 150, dailyLimit: 5,  desc: '500 EXP', exp: 500 },
  candyL:     { name: '大糖果',     price: 600, dailyLimit: 2,  desc: '2500 EXP', exp: 2500 },
  // 技能书
  skillBook:  { name: '技能书',     price: 400, dailyLimit: 2,  desc: '技能升1级' }
};

// 礼物商店：200 金币/个；favorite=true 为角色喜欢的礼物（好感度+30-100 视品质），
// favorite=false 为普通礼物（好感度较低）。
export const GIFTS = {
  蜂蜜罐:       { price: 200, char: 'hajimiao',      favorite: true },
  小鱼干:       { price: 200, char: 'hajimiao',      favorite: false },
  迷你喇叭:     { price: 200, char: 'dasangwang',    favorite: true },
  骨头饼干:     { price: 200, char: 'dasangwang',    favorite: false },
  星星斗篷碎片: { price: 200, char: 'feitianxia',    favorite: true },
  能量饮料:     { price: 200, char: 'feitianxia',    favorite: false },
  幸运硬币:     { price: 200, char: 'zhuanzhuanjun', favorite: true },
  子挂件:       { price: 200, char: 'zhuanzhuanjun', favorite: false },
  金色王冠贴纸: { price: 200, char: 'zifengzhiwang', favorite: true },
  黑色头巾:     { price: 200, char: 'zifengzhiwang', favorite: false },
  粉色蝴蝶结:   { price: 200, char: 'xiaoniu',       favorite: true },
  新鲜牧草:     { price: 200, char: 'xiaoniu',       favorite: false },
  秘制调料包:   { price: 200, char: 'mianshifu',     favorite: true },
  手工围裙:     { price: 200, char: 'mianshifu',     favorite: false }
};
