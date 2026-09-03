// save.js — 《梗灵大陆》存档适配层
// localStorage 读写，异常时降级到内存 Map（Node / 无痕模式下仍可测试运行）。
// 结构严格按 ARCHITECTURE.md 第 4 节；chars 按 js/data/characters.js 真实角色 id 初始化。

import { CHARACTERS } from '../data/characters.js';

const KEY = 'gengling_save_v1';

// 内存降级存储（无 localStorage / 访问抛异常时使用）
const memStore = new Map();

function ls() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) { /* 安全策略下访问 localStorage 可能抛异常 */ }
  return null;
}

function freshChars() {
  const chars = {};
  for (const c of CHARACTERS) {
    chars[c.id] = {
      unlocked: c.id === 'hajimiao', // 初始仅哈基喵可出战（第 1 关再次确认解锁）
      level: 1,
      exp: 0,
      star: 0,        // 0 = 1星（刚解锁），4 = 满星（5星）
      shards: 0,
      favor: 1,       // 好感度等级 1-10
      favorExp: 0,
      skillLv: 1
    };
  }
  return chars;
}

function freshDefault() {
  return {
    gold: 500,
    energy: 20,
    energyTs: Date.now(), // 上次体力结算时间戳（5 分钟/点，上限 30）
    steps: 0,             // 总步数（成就用）
    unlockedLevels: 1,
    levelStars: {},
    progress: {},         // 章节宝箱等一次性进度：progress['box_'+chapter]=true
    chars: freshChars(),
    items: { hammer: 2, crossBomb: 1, colorBottle: 0, extraSteps: 1, shield: 1, shieldMax: 0, shieldProMax: 0, shieldUltra: 0, candyS: 0, candyM: 0, candyL: 0, skillBook: 0, energyPotion: 0 },
    team: ['hajimiao', null, null],
    pity: {},             // 各角色连续未掉碎片关卡数（保底 30）
    achievements: {},
    lastShardFail: 0
  };
}

// 深度合并：以 DEFAULT 为骨架，逐字段覆盖（兼容旧版本存档缺字段）
function mergeSave(saved) {
  const base = freshDefault();
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(base)) {
    const v = saved[k];
    if (v === undefined || v === null) continue;
    if (k === 'chars' || k === 'items' || k === 'pity' || k === 'achievements' || k === 'levelStars' || k === 'progress') {
      base[k] = Object.assign(base[k], v);
    } else {
      base[k] = v;
    }
  }
  // 保证角色字段完整（新增角色 / 老存档）
  const fresh = freshChars();
  for (const id of Object.keys(fresh)) {
    base.chars[id] = Object.assign(fresh[id], base.chars[id] || {});
  }
  return base;
}

export const Save = {
  KEY,
  /** 静态默认存档（引用，勿直接修改；需要副本用 Save.default()） */
  DEFAULT: freshDefault(),

  /** 返回一份全新默认存档（深拷贝） */
  default() { return mergeSave(null); },

  /** 读取存档，无存档/损坏返回 null */
  load() {
    try {
      const store = ls();
      const raw = store ? store.getItem(KEY) : memStore.get(KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj;
    } catch (e) {
      return null;
    }
  },

  /** 写入存档（异常静默降级到内存） */
  save(obj) {
    try {
      const raw = JSON.stringify(obj);
      const store = ls();
      if (store) store.setItem(KEY, raw);
      else memStore.set(KEY, raw);
      return true;
    } catch (e) {
      try { memStore.set(KEY, JSON.stringify(obj)); } catch (e2) { /* 彻底失败则放弃 */ }
      return false;
    }
  },

  /** 清空存档 */
  reset() {
    try {
      const store = ls();
      if (store) store.removeItem(KEY);
      else memStore.delete(KEY);
    } catch (e) { /* ignore */ }
    memStore.delete(KEY);
    return Save.default();
  },

  /** 用默认结构补全任意（可能残缺的）存档对象 */
  merge(saved) { return mergeSave(saved); }
};
