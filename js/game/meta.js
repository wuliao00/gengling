// meta.js — 《梗灵大陆》元游戏：体力/金币/进度/养成（升级、升星、碎片保底、好感度）
// 接口严格按 ARCHITECTURE.md 第 4 节；角色数值读取 js/data/characters.js 真实数据。

import { Save } from './save.js';
import { CHARACTERS } from '../data/characters.js';
import { LEVELS, CHAPTERS } from '../data/levels.js';

export const EXP_TABLE = [100, 150, 200, 280, 380, 500, 650, 820, 1000, 1250, 1500, 1800, 2100, 2500, 3000, 3500, 4000, 4600, 5200, 6000, 6800, 7700, 8600, 9600, 11000, 12500, 14000, 15800, 18000];
export const STAR_COSTS = [20, 40, 60, 100];   // 星级 star: 0→1, 1→2, 2→3, 3→4
export const STAR_BONUS = [0.05, 0.10, 0.15, 0.20]; // 每次升星的 HP/ATK 百分比加成（累计）
export const UNLOCK_SHARDS = 30;               // 解锁角色所需碎片
export const FAVOR_TABLE = [100, 250, 500, 800, 1200, 1800, 2500, 3500, 5000]; // 好感 1→2 ... 9→10
export const ENERGY_MAX = 30;
export const REGEN_MS = 5 * 60 * 1000;         // 5 分钟回 1 点
export const PITY_LIMIT = 30;                  // 连续 30 关没某角色碎片 → 第 31 关必掉

export const MAX_LEVEL = 30;
export const MAX_STAR = 4;    // star 4 = 满星（5星）
export const MAX_FAVOR = 10;

// 各章主要产出角色（需求 3.4）
export const CHAPTER_CHARS = {
  1: 'hajimiao', 2: 'dasangwang', 3: 'feitianxia', 4: 'zhuanzhuanjun',
  5: 'zifengzhiwang', 6: 'xiaoniu', 7: 'mianshifu'
};

const CHAR_IDS = CHARACTERS.map(c => c.id);

function charDef(id) { return CHARACTERS.find(c => c.id === id) || null; }

export const Meta = {
  save: null,
  levels: LEVELS,
  chapters: CHAPTERS,
  /** 随机源（可注入以便测试），需提供 next() [0,1) */
  rand: Math.random,

  /**
   * 初始化。save 传 null 时自动从存储读取，仍无则新建默认存档。
   * levels/chapters 可注入（测试用），默认用真实数据。
   */
  init(save = null, levels = LEVELS, chapters = CHAPTERS) {
    this.levels = levels || LEVELS;
    this.chapters = chapters || CHAPTERS;
    let s = save;
    if (!s) s = Save.load();
    this.save = Save.merge(s);
    this.persist();
    return this.save;
  },

  get() { return this.save; },
  persist() { Save.save(this.save); },
  save() { this.persist(); },

  // ===== 金币 =====
  addGold(n) {
    this.save.gold = Math.max(0, (this.save.gold || 0) + n);
    this.persist();
    return this.save.gold;
  },
  spendGold(n) {
    if ((this.save.gold || 0) < n) return false;
    this.save.gold -= n;
    this.persist();
    return true;
  },

  // ===== 体力（时间戳结算：每 5 分钟 1 点，上限 30）=====
  energy: {
    get() {
      Meta.energy.regen();
      return Meta.save.energy;
    },
    /** 扣体力，不足返回 false */
    cost(n) {
      Meta.energy.regen();
      if (Meta.save.energy < n) return false;
      Meta.save.energy -= n;
      Meta.persist();
      return true;
    },
    /** 按时间戳结算自然回复；now 可注入（测试 mock） */
    regen(now = Date.now()) {
      const s = Meta.save;
      if (!s) return;
      if (typeof s.energyTs !== 'number' || !s.energyTs) s.energyTs = now;
      if (s.energy >= ENERGY_MAX) { s.energy = ENERGY_MAX; s.energyTs = now; return; }
      const gained = Math.floor((now - s.energyTs) / REGEN_MS);
      if (gained <= 0) return;
      if (s.energy + gained >= ENERGY_MAX) {
        s.energy = ENERGY_MAX;
        s.energyTs = now; // 已满，重新计时
      } else {
        s.energy += gained;
        s.energyTs += gained * REGEN_MS;
      }
      Meta.persist();
    }
  },

  // ===== 关卡结算 =====
  findLevel(id) { return this.levels.find(l => l.id === id) || null; },

  /** 关卡胜利结算：发奖/解锁/保底。返回 {rewards, levelUps, unlocks, pityForce, chapterBox} */
  completeLevel(levelId, stars = 1, stats = {}) {
    const s = this.save;
    const lv = this.findLevel(levelId);
    const result = {
      rewards: { gold: 0, candy: { small: 0 }, shards: {}, exp: {} },
      levelUps: {},   // charId -> [新等级...]
      unlocks: [],    // 新解锁角色 id
      pityForce: [],  // 触发保底的角色 id
      chapterBox: null,
      nextLevel: null
    };
    const isBoss = !!(lv && (lv.boss || lv.type === 'boss'));

    // --- 金币（3 星 +50%）---
    let gold = (lv && lv.rewards && lv.rewards.gold != null) ? lv.rewards.gold : 50;
    if (stars >= 3) gold = Math.round(gold * 1.5);
    if (stats.highRisk) gold = Math.round(gold * 2); // 赌局高风险模式奖励翻倍
    result.rewards.gold = gold;
    this.addGold(gold);

    // --- 小糖果 3-5 个（入库 + 自动喂养队内角色 100EXP/个）---
    const nCandy = 3 + Math.floor(this.rand() * 3);
    s.items.candyS = (s.items.candyS || 0) + nCandy;
    result.rewards.candy.small = nCandy;
    const teamIds = (s.team || []).filter(Boolean);
    for (const id of teamIds) {
      const ups = this.addExp(id, nCandy * 100);
      if (ups.length) result.levelUps[id] = ups;
      result.rewards.exp[id] = nCandy * 100;
    }

    // --- 好感度：出战 1 关 +10 ---
    for (const id of teamIds) this.addFavorExp(id, 10);

    // --- 碎片 ---
    const drops = {}; // charId -> n
    if (isBoss) {
      // Boss 关：3-5 个指定章节角色碎片
      const ch = lv.chapter;
      const bossChar = CHAPTER_CHARS[ch] || (lv.rewards && lv.rewards.shardChar) || CHAR_IDS[Math.floor(this.rand() * CHAR_IDS.length)];
      drops[bossChar] = (drops[bossChar] || 0) + 3 + Math.floor(this.rand() * 3);
    } else {
      let n = 1 + Math.floor(this.rand() * 2); // 1-2
      if (lv && lv.rewards && lv.rewards.shard != null) n = lv.rewards.shard;
      if (n > 0) {
        const target = (lv && lv.rewards && lv.rewards.shardChar) || CHAR_IDS[Math.floor(this.rand() * CHAR_IDS.length)];
        drops[target] = (drops[target] || 0) + n;
      }
    }

    // --- 保底：所有角色 pity+1（本关视为未掉），pity>30 者强制掉 1 ---
    for (const id of CHAR_IDS) s.pity[id] = (s.pity[id] || 0) + 1;
    for (const id of CHAR_IDS) {
      if (s.pity[id] > PITY_LIMIT) {
        drops[id] = (drops[id] || 0) + 1;
        result.pityForce.push(id);
      }
    }

    // 应用掉落：掉到的角色 pity 清零
    for (const id of Object.keys(drops)) {
      this.addShard(id, drops[id]);
      s.pity[id] = 0;
      result.rewards.shards[id] = drops[id];
    }

    // --- 解锁下一关 ---
    {
      const next = levelId + 1;
      if (next > (s.unlockedLevels || 1)) { s.unlockedLevels = next; result.nextLevel = next; }
    }

    // --- 关卡解锁角色（免费直接解锁）---
    if (lv && lv.unlockChar && s.chars[lv.unlockChar] && !s.chars[lv.unlockChar].unlocked) {
      this.forceUnlock(lv.unlockChar);
      result.unlocks.push(lv.unlockChar);
    }

    // --- 星级记录 ---
    s.levelStars[levelId] = Math.max(s.levelStars[levelId] || 0, stars);
    s.steps = (s.steps || 0) + (stats.steps || 0);

    // --- 章节全通 → 宝箱提示（仅首次）---
    if (lv) {
      const chapterLvls = this.levels.filter(l => l.chapter === lv.chapter);
      const chDef = this.chapters.find(c => c.id === lv.chapter);
      const allDone = chapterLvls.length > 0 && chapterLvls.every(l => s.levelStars[l.id] > 0);
      const boxKey = 'box_' + lv.chapter;
      if (chDef && allDone && !s.progress[boxKey]) {
        s.progress[boxKey] = true;
        result.chapterBox = { chapter: chDef.id, name: chDef.name, box: chDef.box || '' };
      }
    }

    this.persist();
    return result;
  },

  /** 失败扣除体力：普通 2 / Boss 3 */
  failLevel(levelId) {
    const lv = this.findLevel(levelId);
    const cost = (lv && (lv.boss || lv.type === 'boss')) ? 3 : 2;
    this.energy.regen();
    this.save.energy = Math.max(0, this.save.energy - cost);
    this.persist();
    return cost;
  },

  // ===== 养成 =====

  /** 当前角色战力 {hp, atk, mult}（含星级百分比加成，星级只加 hp/atk） */
  charPower(charId) {
    const def = charDef(charId);
    const st = this.save.chars[charId];
    if (!def || !st) return { hp: 0, atk: 0, mult: 1 };
    const t = Math.min(1, (st.level - 1) / 29);
    let hp = Math.round(Math.min(def.max.hp, def.base.hp + def.perLevel.hp * (st.level - 1)));
    let atk = Math.round(Math.min(def.max.atk, def.base.atk + def.perLevel.atk * (st.level - 1)));
    let mult = def.base.mult + (def.max.mult - def.base.mult) * t;
    const starPct = STAR_BONUS.slice(0, st.star).reduce((a, b) => a + b, 0);
    hp = Math.round(hp * (1 + starPct));
    atk = Math.round(atk * (1 + starPct));
    return { hp, atk, mult: Math.round(mult * 1000) / 1000 };
  },

  /** 队伍总战力 = Σ (HP×0.5 + ATK×2 + 消除倍率×500) */
  teamPower() {
    return (this.save.team || []).filter(Boolean)
      .reduce((sum, id) => {
        const p = this.charPower(id);
        return sum + p.hp * 0.5 + p.atk * 2 + p.mult * 500;
      }, 0);
  },

  /** 加经验并结算升级（每级好感 +20），返回升级到的等级数组 */
  addExp(charId, exp) {
    const st = this.save.chars[charId];
    if (!st || exp <= 0) return [];
    const ups = [];
    st.exp += exp;
    while (st.level < MAX_LEVEL && st.exp >= EXP_TABLE[st.level - 1]) {
      st.exp -= EXP_TABLE[st.level - 1];
      st.level++;
      this.addFavorExp(charId, 20);
      ups.push(st.level);
    }
    if (st.level >= MAX_LEVEL) st.exp = Math.min(st.exp, EXP_TABLE[MAX_LEVEL - 2]); // 满级经验封顶（29→30 所需值）
    this.persist();
    return ups;
  },

  addShard(charId, n) {
    const st = this.save.chars[charId];
    if (!st) return false;
    st.shards = Math.max(0, st.shards + n);
    this.persist();
    return true;
  },

  /** 升星：消耗 STAR_COSTS[star]，返回 true/false */
  starUp(charId) {
    const st = this.save.chars[charId];
    if (!st || st.star >= MAX_STAR) return false;
    const cost = STAR_COSTS[st.star];
    if (st.shards < cost) return false;
    st.shards -= cost;
    st.star++;
    this.persist();
    return true;
  },

  /** 解锁角色：消耗 30 碎片 */
  unlockChar(charId) {
    const st = this.save.chars[charId];
    if (!st || st.unlocked) return false;
    if (st.shards < UNLOCK_SHARDS) return false;
    st.shards -= UNLOCK_SHARDS;
    st.unlocked = true;
    this.persist();
    return true;
  },

  /** 关卡奖励直接解锁（不耗碎片） */
  forceUnlock(charId) {
    const st = this.save.chars[charId];
    if (!st) return false;
    st.unlocked = true;
    this.persist();
    return true;
  },

  /** 好感度经验（出战+10 / 用技能+5 / 升级+20 / 送礼+30~100），等级 1-10 */
  addFavorExp(charId, n) {
    const st = this.save.chars[charId];
    if (!st) return st ? st.favor : 0;
    st.favorExp = (st.favorExp || 0) + n;
    let up = false;
    while (st.favor < MAX_FAVOR && st.favorExp >= FAVOR_TABLE[st.favor - 1]) {
      st.favorExp -= FAVOR_TABLE[st.favor - 1];
      st.favor++;
      up = true;
    }
    if (st.favor >= MAX_FAVOR) st.favorExp = Math.min(st.favorExp, FAVOR_TABLE[MAX_FAVOR - 2]);
    if (up) this.persist();
    return st.favor;
  }
};
