// ============================================================
// js/ui/art.js —— AI 生成美术资源加载与绘制（V4 美术升级）
//
// 职责：
//   - 预加载 assets/ 下的角色立绘(7) / 敌人立绘(16) / 标题 Logo
//   - 提供按 key 贴图的绘制工具（保持宽高比、支持倾斜表意）
//   - 加载失败/超时不阻塞游戏：绘制函数自动回退到原矢量方案
//
// 约定：立绘 PNG 均为透明底、单角色居中，按"高度"等比绘制。
// ============================================================

// 角色 id → 立绘文件
const CHAR_FILES = {
  hajimiao: 'char_hajimiao.png',
  dasangwang: 'char_dasangwang.png',
  feitianxia: 'char_feitianxia.png',
  zhuanzhuanjun: 'char_zhuanzhuanjun.png',
  zifengzhiwang: 'char_zifengzhiwang.png',
  xiaoniu: 'char_xiaoniu.png',
  mianshifu: 'char_mianshifu.png',
};

// 敌人名关键词 → 立绘索引（assets/enemy_XX.png，顺序即优先级）
// 索引对应预处理切图：0史莱姆 1蝙蝠 2岩石蟹 3幽灵 4风精灵 5雷云兽 6风暴鸦
// 7云巨人 8白云 9巨龙 10狂暴巨龙 11赌王 12筹码骑士 13老虎机 14守卫 15无聊魔王
const ENEMY_RULES = [
  ['史莱姆', 0],
  ['蝠', 1],
  ['蟹', 2],
  ['领主', 3],
  ['子魔', 3],
  ['梗影', 3],
  ['精灵', 4],
  ['雷云', 5],
  ['噪音', 5],
  ['鸦', 6],
  ['巨人', 7],
  ['风暴巨龙', 10],
  ['巨龙', 9],
  ['赌王', 11],
  ['筹码', 12],
  ['老虎机', 13],
  ['守卫', 14],
  ['无尽Boss', 15],
  ['魔王', 15],
];

const IMGS = {};   // key -> HTMLImageElement
let _promise = null;

function _load(key, file) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve();   // 无头测试环境：直接回退矢量
    const img = new Image();
    img.onload = () => { IMGS[key] = img; resolve(); };
    img.onerror = () => resolve();   // 失败静默：绘制端回退矢量
    img.src = 'assets/' + file;
  });
}

/**
 * 预加载全部立绘。
 * @param {number} timeoutMs 兜底超时：到时即放行首屏（未到的图后续到达也会生效）
 */
export function loadArt(timeoutMs = 1200) {
  if (_promise) return _promise;
  const jobs = Object.keys(CHAR_FILES).map(k => _load('char:' + k, CHAR_FILES[k]));
  for (let i = 0; i < 16; i++) {
    jobs.push(_load('enemy:' + i, 'enemy_' + String(i).padStart(2, '0') + '.png'));
  }
  jobs.push(_load('logo', 'logo.png'));
  _promise = Promise.race([
    Promise.all(jobs),
    new Promise(r => setTimeout(r, timeoutMs)),
  ]);
  return _promise;
}

/** 指定资源是否已就绪 */
export function artHas(key) { return !!IMGS[key]; }

/** 角色 id → 资源 key（未知角色回退哈基喵） */
export function charArtKey(charId) {
  return 'char:' + (CHAR_FILES[charId] ? charId : 'hajimiao');
}

/** 敌人名 → 资源 key（未命中返回 null，调用方回退矢量） */
export function enemyArtKey(name) {
  const s = String(name || '');
  for (const [kw, idx] of ENEMY_RULES) {
    if (s.includes(kw)) return 'enemy:' + idx;
  }
  return null;
}

/** Logo 图片元素（未就绪返回 null） */
export function logoArt() { return IMGS.logo || null; }

/**
 * 以 (x, y) 为图形中心、height 为目标高度等比贴图
 * @param {number} tilt 轻微倾斜（弧度，受击/眩晕表意用）
 * @returns {boolean} 是否实际绘制（false = 资源未就绪）
 */
export function drawArtCentered(ctx, key, x, y, height, tilt = 0) {
  const img = IMGS[key];
  if (!img || !ctx) return false;
  const w = height * (img.width / img.height);
  ctx.save();
  if (tilt) {
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.drawImage(img, -w / 2, -height / 2, w, height);
  } else {
    ctx.drawImage(img, x - w / 2, y - height / 2, w, height);
  }
  ctx.restore();
  return true;
}
