// render.js — 《梗灵大陆》唯一的 Canvas 绘制者
// 职责：8×8 圆角呆萌方块棋盘渲染、事件动画队列、角色/敌人/LOGO 手绘
// 无 DOM 依赖之外不引用 game/data 层，可独立联调。
//
// V2.3 性能改造：
//  - 精灵缓存 _spriteCache：每种 (color,variant,ice,chain,special[,rainbow帧])
//    按 cs×dpr 预渲染到离屏 canvas，主循环只 drawImage；resize/attach 重建。
//    单帧零 createLinearGradient（底板渐变亦缓存）、表情等全部进缓存。
//  - playEvents 同批事件并行播放，阶段时长缩短 30%
//    （pop 85ms / fall 110ms / refill 105ms），单轮 MoveResult ≤500ms。
//  - playFx 统一特效入口 + floatText 画布内飘字（替代 DOM 方案）。

import { drawArtCentered, enemyArtKey, artHas, logoArt } from './art.js';

// ============ 调色与常量 ============
// 颜色索引：0红 1蓝 2绿 3黄 4紫 5橙 6彩虹专用
export const CELL_COLORS = [
  { base: '#FF6B6B', light: '#FFA3A3', dark: '#DE4A4A' }, // 0 红
  { base: '#5BA8FF', light: '#A2CDFF', dark: '#3B7FD4' }, // 1 蓝
  { base: '#6BCB77', light: '#A8E8AF', dark: '#47A052' }, // 2 绿
  { base: '#FFD93D', light: '#FFEB9C', dark: '#E2AC18' }, // 3 黄
  { base: '#B983FF', light: '#DCC0FF', dark: '#8F55E0' }, // 4 紫
  { base: '#FF9F45', light: '#FFC68F', dark: '#E87B1D' }, // 5 橙
];
export const RAINBOW_HUES = ['#FF6B6B', '#FFB627', '#FFE066', '#6BCB77', '#5BA8FF', '#B983FF'];

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// 十六进制色 → rgba 字符串（特效层用，避免运行时建渐变）
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

// 圆角矩形路径
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 每格表情 variant 的确定性分布表（r*31+c*17)%4，避免每帧计算
const VARIANT = [];
for (let r = 0; r < 8; r++) {
  const row = [];
  for (let c = 0; c < 8; c++) row.push((r * 31 + c * 17) % 4);
  VARIANT.push(row);
}

// ============ 高分屏画布工具（供各场景复用） ============
let _dpr = (typeof window !== 'undefined' && window.devicePixelRatio)
  ? Math.min(window.devicePixelRatio, 3) : 1;

export function prepCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  _dpr = dpr;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ============================================================
// 精灵缓存：主循环只 drawImage，杜绝每帧渐变/大量 path
// ============================================================
const SPRITE_PAD = 2;                    // 精灵四周留白（描边/光晕溢出）
const RAINBOW_FRAMES = 8;                // 彩虹球预渲染帧数
const RAINBOW_FRAME_MS = 650 / RAINBOW_FRAMES;
const _spriteCache = new Map();          // key -> { cv, size }
let _spriteSig = '';                     // 'cs|dpr'，变化即整体失效

function _spriteKey(color, variant, ice, chain, special, frame) {
  return color + '|' + variant + '|' + ice + '|' + chain + '|' + special + '|' + frame;
}

// 单个精灵的完整绘制（供缓存与降级路径共用）
function _paintCellBody(ctx, cs, color, variant, special, frame) {
  if (special === 'rainbow') {
    drawRainbowOrb(ctx, cs / 2, cs / 2, cs, frame * RAINBOW_FRAME_MS);
    return;
  }
  const col = CELL_COLORS[color] || CELL_COLORS[0];
  const g = ctx.createLinearGradient(0, 0, 0, cs);
  g.addColorStop(0, col.light); g.addColorStop(1, col.base);
  rr(ctx, 0, 0, cs, cs, cs * 0.3);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1, cs * 0.04); ctx.strokeStyle = col.dark; ctx.stroke();
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  rr(ctx, cs * 0.12, cs * 0.09, cs * 0.3, cs * 0.12, cs * 0.06); ctx.fill();

  if (special === 'rowBomb') drawBombDeco(ctx, 0, 0, cs, 'row');
  else if (special === 'colBomb') drawBombDeco(ctx, 0, 0, cs, 'col');
  drawFace(ctx, cs / 2, cs / 2, cs, variant);
}

function _buildSprite(cs, dpr, color, variant, ice, chain, special, frame) {
  const size = cs + SPRITE_PAD * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(size * dpr));
  cv.height = Math.max(1, Math.ceil(size * dpr));
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  c.translate(SPRITE_PAD, SPRITE_PAD);
  _paintCellBody(c, cs, color, variant, special, frame);
  if (ice > 0) drawIce(c, 0, 0, cs, ice);
  if (chain > 0) drawChain(c, cs / 2, cs / 2, cs);
  return { cv, size };
}

/** 取精灵（按需构建 + 缓存），返回 null 表示环境不支持 */
function getSprite(cs, dpr, color, variant, ice, chain, special, frame = 0) {
  if (typeof document === 'undefined' || !(cs > 0)) return null;
  const sig = cs.toFixed(2) + '|' + dpr;
  if (_spriteSig !== sig) { _spriteCache.clear(); _spriteSig = sig; }
  const v = special === 'rainbow' ? 0 : (variant | 0);
  const key = _spriteKey(color | 0, v, ice | 0, chain | 0, special || '-', frame | 0);
  let sp = _spriteCache.get(key);
  if (sp) return sp;
  sp = _buildSprite(cs, dpr, color | 0, v, ice | 0, chain | 0, special, frame | 0);
  _spriteCache.set(key, sp);
  if (_spriteCache.size > 600) { // 兜底上限，淘汰最早未用项
    const first = _spriteCache.keys().next().value;
    _spriteCache.delete(first);
  }
  return sp;
}

/**
 * 单个方块绘制（含特殊层）—— 精灵缓存优先，一次 drawImage 完成；
 * 传 scale/alpha 时对精灵整体缩放/淡出绘制，动画帧同样走缓存。
 */
function drawCellAt(ctx, cell, x, y, cs, opts = {}) {
  if (!cell) return;
  const { scale = 1, alpha = 1, variant = 0, time = 0 } = opts;
  const special = cell.special || null;
  const frame = special === 'rainbow' ? Math.floor((time || 0) / RAINBOW_FRAME_MS) % RAINBOW_FRAMES : 0;
  const sp = getSprite(cs, _dpr, cell.color || 0, variant, cell.ice | 0, cell.chain | 0, special, frame);
  if (sp) {
    const s = sp.size * scale;
    const px = x + cs / 2 - s / 2, py = y + cs / 2 - s / 2;
    if (alpha < 1) {
      const g0 = ctx.globalAlpha;
      ctx.globalAlpha = g0 * alpha;
      ctx.drawImage(sp.cv, px, py, s, s);
      ctx.globalAlpha = g0;
    } else {
      ctx.drawImage(sp.cv, px, py, s, s);
    }
    return;
  }
  // 降级路径（非浏览器环境）：实时绘制
  const cx = x + cs / 2, cy = y + cs / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }
  _paintCellBody(ctx, cs, cell.color || 0, variant, special, frame);
  if ((cell.ice | 0) > 0) drawIce(ctx, x, y, cs, cell.ice);
  if ((cell.chain | 0) > 0) drawChain(ctx, cx, cy, cs);
  ctx.restore();
}

// ============================================================
// 呆萌表情（所有方块共用）
// ============================================================
export function drawFace(ctx, cx, cy, s, v = 0) {
  const er = s * 0.062;                 // 眼睛半径
  const exL = cx - s * 0.16, exR = cx + s * 0.16;
  const ey = cy - s * 0.05;
  // 腮红
  ctx.fillStyle = 'rgba(255,110,130,.42)';
  for (const bx of [cx - s * 0.25, cx + s * 0.25]) {
    ctx.beginPath(); ctx.ellipse(bx, cy + s * 0.1, s * 0.085, s * 0.055, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 眼睛
  if (v === 1) { // 眯眯笑 ^ ^
    ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = Math.max(1.2, s * 0.045); ctx.lineCap = 'round';
    for (const ex of [exL, exR]) {
      ctx.beginPath(); ctx.arc(ex, ey + er * 0.4, er * 1.15, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#3A2A18';
    for (const ex of [exL, exR]) {
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(ex - er * 0.3, ey - er * 0.35, er * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3A2A18';
    }
  }
  // 嘴巴
  const my = cy + s * 0.12;
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = Math.max(1.2, s * 0.04); ctx.lineCap = 'round';
  if (v === 2) { // 惊讶小圆嘴
    ctx.fillStyle = '#7A4A3A';
    ctx.beginPath(); ctx.ellipse(cx, my, s * 0.05, s * 0.065, 0, 0, Math.PI * 2); ctx.fill();
  } else if (v === 3) { // 吐舌头
    ctx.beginPath(); ctx.arc(cx, my - s * 0.02, s * 0.07, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.fillStyle = '#FF8FA3';
    ctx.beginPath(); ctx.ellipse(cx, my + s * 0.045, s * 0.045, s * 0.055, 0, 0, Math.PI); ctx.fill();
  } else if (v === 4) { // 猫嘴 ω
    ctx.beginPath();
    ctx.arc(cx - s * 0.045, my - s * 0.02, s * 0.045, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.045, my - s * 0.02, s * 0.045, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else { // 默认微笑
    ctx.beginPath(); ctx.arc(cx, my - s * 0.03, s * 0.08, 0.25, Math.PI - 0.25); ctx.stroke();
  }
}

// 条纹 + 箭头（行/列炸弹）
function drawBombDeco(ctx, px, py, s, dir) {
  ctx.save();
  rr(ctx, px, py, s, s, s * 0.3); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.32)';
  if (dir === 'row') {
    for (let i = 0; i < 3; i++) ctx.fillRect(px, py + s * (0.18 + i * 0.26), s, s * 0.1);
  } else {
    for (let i = 0; i < 3; i++) ctx.fillRect(px + s * (0.18 + i * 0.26), py, s * 0.1, s);
  }
  ctx.restore();
  // 双箭头
  const cx = px + s / 2, cy = py + s / 2, a = s * 0.11, off = s * 0.3;
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(1.6, s * 0.06);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (dir === 'row') {
    ctx.moveTo(cx - off + a, cy - a); ctx.lineTo(cx - off, cy); ctx.lineTo(cx - off + a, cy + a);
    ctx.moveTo(cx + off - a, cy - a); ctx.lineTo(cx + off, cy); ctx.lineTo(cx + off - a, cy + a);
  } else {
    ctx.moveTo(cx - a, cy - off + a); ctx.lineTo(cx, cy - off); ctx.lineTo(cx + a, cy - off + a);
    ctx.moveTo(cx - a, cy + off - a); ctx.lineTo(cx, cy + off); ctx.lineTo(cx + a, cy + off - a);
  }
  ctx.stroke();
}

// 彩虹球：旋转彩虹圈 + 白芯呆萌脸（精灵缓存时按 frame 预渲染 8 帧）
function drawRainbowOrb(ctx, cx, cy, s, time) {
  const R = s * 0.4;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R + s * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFDF6'; ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.04); ctx.strokeStyle = '#E8D5AE'; ctx.stroke();
  const rot = (time || 0) / 650;
  const seg = Math.PI * 2 / RAINBOW_HUES.length;
  ctx.lineWidth = s * 0.13; ctx.lineCap = 'butt';
  for (let i = 0; i < RAINBOW_HUES.length; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, rot + i * seg, rot + (i + 1) * seg - 0.04);
    ctx.strokeStyle = RAINBOW_HUES[i];
    ctx.stroke();
  }
  drawFace(ctx, cx, cy, s * 0.72, 0);
  ctx.restore();
}

// 冰晶覆盖：半透明蓝白 + 高光 + 裂纹
function drawIce(ctx, px, py, s, hp) {
  ctx.save();
  rr(ctx, px + s * 0.03, py + s * 0.03, s * 0.94, s * 0.94, s * 0.28);
  ctx.fillStyle = 'rgba(198,232,255,.75)'; ctx.fill();
  ctx.lineWidth = Math.max(1.2, s * 0.045); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  // 高光斜条
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.moveTo(px + s * 0.15, py + s * 0.85);
  ctx.lineTo(px + s * 0.6, py + s * 0.12);
  ctx.lineTo(px + s * 0.78, py + s * 0.12);
  ctx.lineTo(px + s * 0.32, py + s * 0.85);
  ctx.closePath(); ctx.fill();
  if (hp <= 1) { // 快碎了的裂纹
    ctx.strokeStyle = 'rgba(90,150,210,.75)'; ctx.lineWidth = Math.max(1, s * 0.03); ctx.lineCap = 'round';
    const cx = px + s / 2, cy = py + s / 2;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.3, cy - s * 0.2); ctx.lineTo(cx - s * 0.05, cy); ctx.lineTo(cx - s * 0.18, cy + s * 0.26);
    ctx.moveTo(cx + s * 0.05, cy); ctx.lineTo(cx + s * 0.3, cy - s * 0.28);
    ctx.moveTo(cx + s * 0.05, cy); ctx.lineTo(cx + s * 0.22, cy + s * 0.24);
    ctx.stroke();
  }
  ctx.restore();
}

// 灰锁链：斜向链条 + 小锁
function drawChain(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = 'rgba(105,105,118,.88)';
  ctx.lineWidth = Math.max(2, s * 0.085); ctx.lineCap = 'round';
  const e = s * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx - e, cy - e); ctx.lineTo(cx + e, cy + e);
  ctx.moveTo(cx + e, cy - e); ctx.lineTo(cx - e, cy + e);
  ctx.stroke();
  // 链环节点
  ctx.fillStyle = 'rgba(140,140,155,.95)';
  for (const [dx, dy] of [[-e * 0.5, -e * 0.5], [e * 0.5, e * 0.5], [e * 0.5, -e * 0.5], [-e * 0.5, e * 0.5]]) {
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, s * 0.055, 0, Math.PI * 2); ctx.fill();
  }
  // 中央小锁
  const lw = s * 0.26, lh = s * 0.2, lx = cx - lw / 2, ly = cy + s * 0.02;
  ctx.fillStyle = '#8A8A9A';
  rr(ctx, lx, ly, lw, lh, lw * 0.25); ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, ly, lw * 0.26, Math.PI, 0);
  ctx.strokeStyle = '#8A8A9A'; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.stroke();
  ctx.fillStyle = '#FFD93D';
  ctx.beginPath(); ctx.arc(cx, ly + lh * 0.45, Math.max(1.2, lw * 0.1), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 静音区覆盖：灰纱 + 静音喇叭 + 层数点
function drawSilentOverlay(ctx, x, y, cs, layer) {
  ctx.save();
  rr(ctx, x + cs * 0.04, y + cs * 0.04, cs * 0.92, cs * 0.92, cs * 0.26);
  ctx.fillStyle = 'rgba(90,90,105,0.42)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, cs * 0.04);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();
  const cx = x + cs / 2, cy = y + cs / 2, s = cs;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.16, cy - s * 0.06);
  ctx.lineTo(cx - s * 0.06, cy - s * 0.06);
  ctx.lineTo(cx + s * 0.06, cy - s * 0.16);
  ctx.lineTo(cx + s * 0.06, cy + s * 0.16);
  ctx.lineTo(cx - s * 0.06, cy + s * 0.06);
  ctx.lineTo(cx - s * 0.16, cy + s * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,90,90,0.95)';
  ctx.lineWidth = Math.max(1.5, cs * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.14, cy - s * 0.14);
  ctx.lineTo(cx + s * 0.16, cy + s * 0.16);
  ctx.stroke();
  if (layer > 1) {
    ctx.fillStyle = '#FFD93D';
    for (let i = 0; i < layer; i++) {
      ctx.beginPath();
      ctx.arc(x + cs * 0.2 + i * cs * 0.12, y + cs * 0.86, cs * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// 回声石覆盖：同心声波环
function drawEchoOverlay(ctx, x, y, cs) {
  ctx.save();
  const cx = x + cs / 2, cy = y + cs / 2;
  ctx.strokeStyle = 'rgba(120,220,255,0.9)';
  ctx.lineCap = 'round';
  for (let i = 1; i <= 3; i++) {
    ctx.lineWidth = Math.max(1.2, cs * 0.045);
    ctx.beginPath();
    ctx.arc(cx, cy, cs * (0.14 + i * 0.09), -0.6, 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, cs * (0.14 + i * 0.09), Math.PI - 0.6, Math.PI + 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,220,255,0.95)';
  ctx.beginPath();
  ctx.arc(cx, cy, cs * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ============================================================
// BoardRenderer — 棋盘渲染器 + 动画队列
// ============================================================
export class BoardRenderer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.board = null;
    this.cssW = 0; this.cssH = 0;
    this.metrics = { ox: 0, oy: 0, cs: 0 };
    this.anims = { pops: [], falls: [], refills: [], swaps: [], spawns: [], flashes: [], cracks: [], rings: [], floats: [], winds: [], parts: [] };
    this.shakeT = -1e9;
    this.highlight = null;      // [{r,c}] 目标选择高亮
    this.fogOn = false;         // 持续状态：边缘白雾
    this.lockedRows = new Set();// 持续状态：被封锁行
    this._fxSkill = null;       // {t0,dur,color}
    this._fxBoss = null;        // {t0,dur,name}
    this._bgGrad = null; this._bgSig = '';
    this._raf = 0;
    this._running = false;
    this._onResize = () => this.fit();
  }

  /** 绑定画布与棋盘（可重复调用切换棋盘） */
  attach(canvas, board) {
    this.detach();
    this.canvas = canvas;
    this.board = board;
    this.ctx = canvas.getContext('2d');
    this.fit();
    window.addEventListener('resize', this._onResize);
    // 布局稳定后再补算：首帧/字体加载/兄弟节点（成员卡等）撑开高度常晚于本次同步测量，
    // 立即测量会拿到偏小甚至为 0 的父容器高度，导致棋盘被夹小（旧版"第 1 波棋盘偏小"根因）。
    if (typeof requestAnimationFrame === 'function') {
      this._fitRaf = requestAnimationFrame(() => { if (this.canvas) this.fit(); });
    }
    this._fitTimer = setTimeout(() => { if (this.canvas) this.fit(); }, 80);
    this._running = true;
    const loop = (t) => {
      if (!this._running) return;
      // V5：场景切走后画布 display:none（offsetParent=null），跳帧省 CPU
      if (this.canvas && this.canvas.offsetParent === null) {
        this._raf = requestAnimationFrame(loop);
        return;
      }
      this._frame(t);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  detach() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    if (this._fitRaf) { cancelAnimationFrame(this._fitRaf); this._fitRaf = 0; }
    if (this._fitTimer) { clearTimeout(this._fitTimer); this._fitTimer = 0; }
    window.removeEventListener('resize', this._onResize);
    this.canvas = null; this.board = null; this.ctx = null;
  }

  /** 画布尺寸适配：只依据父容器可用空间决定边长，杜绝读取 canvas 自身尺寸造成的"越缩越小"反馈回路 */
  fit() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 390;
    // 可用宽/高优先取父容器（.bt-boardbox）内容尺寸；未布局(<=0)时回退到视口，避免夹到最小值
    const availW = (parent && parent.clientWidth > 0) ? parent.clientWidth : Math.min(vw * 0.96, 560);
    const availH = (parent && parent.clientHeight > 0) ? parent.clientHeight : availW;
    // 棋盘是正方形：取可用宽高的较小者；上限放宽到 640（旧版 540/460 会把大屏棋盘人为缩小）
    const size = Math.max(160, Math.floor(Math.min(availW, availH, 640)));
    prepCanvas(this.canvas, size, size);
    this.cssW = size; this.cssH = size;
    this._updateMetrics();
    this._prewarmSprites();
  }

  _updateMetrics() {
    const cs = Math.min(this.cssW, this.cssH) / 8;
    this.metrics = {
      cs,
      ox: (this.cssW - cs * 8) / 2,
      oy: (this.cssH - cs * 8) / 2,
    };
  }

  /** 预热精灵缓存：基础组合同步建，其余分批后台建（不卡首帧） */
  _prewarmSprites() {
    if (!this.canvas || typeof document === 'undefined') return;
    const cs = this.metrics.cs, dpr = _dpr;
    if (!(cs > 0)) return;
    const wantSig = cs.toFixed(2) + '|' + dpr;
    const jobs = [];
    // 基础 24 个：color × variant
    for (let color = 0; color < 6; color++) {
      for (let variant = 0; variant < 4; variant++) jobs.push([color, variant, 0, 0, null, 0]);
    }
    // 炸弹 48 个
    for (let color = 0; color < 6; color++) {
      for (let variant = 0; variant < 4; variant++) {
        jobs.push([color, variant, 0, 0, 'rowBomb', 0]);
        jobs.push([color, variant, 0, 0, 'colBomb', 0]);
      }
    }
    // 冰 1/2 层 × 链 0-3
    for (let color = 0; color < 6; color++) {
      for (let variant = 0; variant < 4; variant++) {
        for (let ice = 1; ice <= 2; ice++) {
          for (let chain = 0; chain <= 3; chain++) jobs.push([color, variant, ice, chain, null, 0]);
        }
        for (let chain = 1; chain <= 3; chain++) jobs.push([color, variant, 0, chain, null, 0]);
      }
    }
    // 彩虹 8 帧
    for (let f = 0; f < RAINBOW_FRAMES; f++) jobs.push([0, 0, 0, 0, 'rainbow', f]);
    // 首批同步（24 个，微秒级），其余让出主线程分批
    for (let i = 0; i < 24 && i < jobs.length; i++) {
      const j = jobs[i]; getSprite(cs, dpr, j[0], j[1], j[2], j[3], j[4], j[5]);
    }
    let i = 24;
    const step = () => {
      if (_spriteSig !== wantSig) return;           // 尺寸已变，作废
      const end = Math.min(i + 40, jobs.length);
      for (; i < end; i++) { const j = jobs[i]; getSprite(cs, dpr, j[0], j[1], j[2], j[3], j[4], j[5]); }
      if (i < jobs.length && this.canvas) setTimeout(step, 32);
    };
    setTimeout(step, 60);
  }

  /** 空闲绘制（渲染循环常驻，此方法仅强制同步一帧） */
  drawIdle() {
    if (this.ctx && this.board) this._frame(performance.now());
  }

  /** 屏幕微震 */
  shake() { this.shakeT = performance.now(); }

  /** 目标选择高亮：cells=null 关闭 */
  setHighlight(cells) { this.highlight = cells; }

  /** 持续状态：边缘白雾开关 */
  setFog(on) { this.fogOn = !!on; }

  /** 持续状态：被封锁行（传行号数组；空数组解除） */
  setRowLocks(rows) { this.lockedRows = new Set(rows || []); }

  /**
   * 播放 Board 事件动画。同批事件（一次 match 的所有 pops、一次 fall 的所有 moves）
   * 同时播放，阶段等待缩短 30%：pop 85ms / fall 110ms / refill 105ms；
   * 单轮 MoveResult（match+fall+refill）播放耗时约 300ms（≤500ms 目标）。
   */
  async playEvents(events) {
    if (!Array.isArray(events) || !events.length) return;
    const now = () => performance.now();
    const A = this.anims;
    for (const e of events) {
      if (!e || !e.type) continue;
      switch (e.type) {
        case 'swap': {
          const cells = e.cells || [];
          if (cells.length >= 2) {
            A.swaps.push({ a: cells[0], b: cells[1], t0: now(), dur: 90 });
            await sleep(90);
          }
          break;
        }
        case 'invalid':
          this.shake();
          await sleep(130);
          break;
        case 'match': {
          const pops = (e.cells || []).map((c) => ({ ...c, t0: now(), dur: 85 }));
          A.pops.push(...pops);
          if ((e.chainIndex | 0) > 0) this.shake();
          await sleep(85);
          break;
        }
        case 'specialSpawn':
          // 与消除爆裂并行播放，不阻塞时间线
          A.spawns.push({ r: e.r, c: e.c, kind: e.kind, t0: now(), dur: 170 });
          break;
        case 'fall': {
          const falls = (e.moves || []).map((m) => ({
            from: m.from, to: m.to, cell: m.cell, t0: now(), dur: 110,
          }));
          A.falls.push(...falls);
          await sleep(110);
          break;
        }
        case 'refill': {
          const t0 = now();
          for (const rc of e.cells || []) {
            A.refills.push({ r: rc.r, c: rc.c, cell: rc.cell, t0, dur: 105 });
          }
          await sleep(105);
          break;
        }
        case 'iceBreak':
          A.cracks.push({ r: e.r, c: e.c, ice: true, t0: now(), dur: 220 });
          await sleep(55);
          break;
        case 'chainOpen':
          A.cracks.push({ r: e.r, c: e.c, ice: false, t0: now(), dur: 220 });
          await sleep(55);
          break;
        case 'bomb': {
          this.shake();
          const fl = (e.cleared || []).map((p) => ({ r: p.r, c: p.c, t0: now(), dur: 160 }));
          A.flashes.push(...fl);
          await sleep(160);
          break;
        }
        case 'rainbow': {
          A.rings.push({ r: e.r, c: e.c, t0: now(), dur: 260 });
          await sleep(130);
          this.shake();
          const t0 = now();
          const fl = (e.cleared || []).map((p) => ({ r: p.r, c: p.c, t0, dur: 140 }));
          A.flashes.push(...fl);
          await sleep(140);
          break;
        }
        case 'wind': {
          // 气流：风线扫过该列 + 被吹走格闪白，等待缩短
          A.winds.push({ col: e.col | 0, t0: now(), dur: 250 });
          const t0 = now();
          const fl = (e.cleared || []).map((p) => ({ r: p.r, c: p.c, t0, dur: 140 }));
          A.flashes.push(...fl);
          await sleep(110);
          break;
        }
        case 'floatDrop':
          // 浮空格消除碎裂：与其他事件并行，不阻塞
          A.cracks.push({ r: e.r, c: e.c, ice: false, t0: now(), dur: 220 });
          break;
        case 'treasure':
          this._burstGold(e.r, e.c, 12);
          break;
        default:
          break;
      }
      this._gc(now());
    }
    this._gc(now());
    this.drawIdle();
  }

  _gc(now) {
    const A = this.anims;
    for (const key of Object.keys(A)) {
      A[key] = A[key].filter((a) => now - a.t0 < a.dur + 40);
    }
  }

  /** 金色粒子喷泉（treasure 特效与事件共用） */
  _burstGold(r, c, n = 14) {
    const { cs, ox, oy } = this.metrics;
    if (!(cs > 0)) return;
    const x0 = ox + c * cs + cs / 2, y0 = oy + r * cs + cs / 2;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
      const v = cs * (2.0 + Math.random() * 2.4);
      this.anims.parts.push({
        x0, y0,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        g: cs * 9,
        rad: cs * (0.05 + Math.random() * 0.07),
        t0, dur: 480 + Math.random() * 220,
      });
    }
  }

  // ---------- 主帧渲染 ----------
  _frame(t) {
    const ctx = this.ctx;
    if (!ctx || !this.board) return;
    const W = this.cssW, H = this.cssH;
    this._updateMetrics();
    const { cs, ox, oy } = this.metrics;
    this._gc(t);

    ctx.clearRect(0, 0, W, H);

    // 屏幕微震
    let sx = 0, sy = 0;
    const shk = t - this.shakeT;
    if (shk >= 0 && shk < 260) {
      const k = (1 - shk / 260) * 4.5;
      sx = (Math.random() * 2 - 1) * k;
      sy = (Math.random() * 2 - 1) * k;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // 棋盘底板（渐变仅 resize 时重建，非每帧）
    const pad = cs * 0.12;
    const bgSig = cs.toFixed(2) + '|' + oy.toFixed(2);
    if (this._bgSig !== bgSig) {
      const bg = ctx.createLinearGradient(0, oy, 0, oy + cs * 8);
      bg.addColorStop(0, '#FFF8E8'); bg.addColorStop(1, '#FFEDCB');
      this._bgGrad = bg; this._bgSig = bgSig;
    }
    rr(ctx, ox - pad, oy - pad, cs * 8 + pad * 2, cs * 8 + pad * 2, cs * 0.42);
    ctx.fillStyle = this._bgGrad; ctx.fill();
    ctx.strokeStyle = '#F0D9A8'; ctx.lineWidth = 2; ctx.stroke();

    const g = this.board.grid;
    const A = this.anims;
    const key = (r, c) => r * 8 + c;

    // 建立动画索引
    const popMap = new Map();    for (const p of A.pops)    popMap.set(key(p.r, p.c), p);
    const fallMap = new Map();   for (const f of A.falls)   fallMap.set(key(f.to.r, f.to.c), f);
    const refMap = new Map();    for (const f of A.refills) refMap.set(key(f.r, f.c), f);
    const flashMap = new Map();  for (const f of A.flashes) flashMap.set(key(f.r, f.c), f);
    const crackMap = new Map();  for (const c of A.cracks)  crackMap.set(key(c.r, c.c), c);
    const spawnMap = new Map();  for (const s of A.spawns)  spawnMap.set(key(s.r, s.c), s);
    const swapMap = new Set();
    const swapSprites = [];
    for (const sw of A.swaps) {
      const p = clamp((t - sw.t0) / sw.dur, 0, 1);
      const e = easeOut(p);
      const a = sw.a || {}, b = sw.b || {};
      if (a.r == null || b.r == null) continue;
      swapMap.add(key(a.r, a.c)); swapMap.add(key(b.r, b.c));
      swapSprites.push({
        cell: a, x: (a.c + (b.c - a.c) * e) * cs + ox, y: (a.r + (b.r - a.r) * e) * cs + oy,
        vr: b.r, vc: b.c,
      });
      swapSprites.push({
        cell: b, x: (b.c + (a.c - b.c) * e) * cs + ox, y: (b.r + (a.r - b.r) * e) * cs + oy,
        vr: a.r, vc: a.c,
      });
    }

    const rows = g.length, cols = rows ? g[0].length : 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = key(r, c);
        const x = ox + c * cs, y = oy + r * cs;
        // 爆裂中：画洞 + 爆裂特效
        const pop = popMap.get(k);
        if (pop) { this._drawPop(ctx, pop, x, y, cs, t); continue; }
        // 掉落中：终点由掉落精灵绘制
        if (fallMap.has(k)) continue;
        // 交换中：由交换精灵绘制
        if (swapMap.has(k)) continue;

        const cell = g[r][c];
        const ref = refMap.get(k);
        const spawn = spawnMap.get(k);
        const variant = VARIANT[r] ? VARIANT[r][c] : 0;
        if (ref) {
          const p = clamp((t - ref.t0) / ref.dur, 0, 1);
          drawCellAt(ctx, cell, x, y - (1 - p) * cs * 0.8, cs,
            { variant, time: t, alpha: p, scale: 0.6 + 0.4 * p });
        } else if (spawn) {
          const p = clamp((t - spawn.t0) / spawn.dur, 0, 1);
          drawCellAt(ctx, cell, x, y, cs, { variant, time: t, scale: 0.4 + 0.6 * easeOutBack(p) });
          if (p < 1) { // 生成星光
            ctx.globalAlpha = 1 - p;
            ctx.fillStyle = '#FFE066';
            for (let i = 0; i < 4; i++) {
              const ang = Math.PI / 2 * i + Math.PI / 4;
              ctx.beginPath();
              ctx.arc(x + cs / 2 + Math.cos(ang) * cs * (0.3 + p * 0.4), y + cs / 2 + Math.sin(ang) * cs * (0.3 + p * 0.4), cs * 0.05, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
        } else {
          drawCellAt(ctx, cell, x, y, cs, { variant, time: t });
        }
      }
    }

    // 回声石 / 静音区 覆盖标记（画在方块之上）
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = g[r][c];
      if (!cell) continue;
      const x = ox + c * cs, y = oy + r * cs;
      if (cell.silent > 0) drawSilentOverlay(ctx, x, y, cs, cell.silent);
      else if (cell.echo > 0) drawEchoOverlay(ctx, x, y, cs);
    }

    // 掉落精灵（带小回弹）
    for (const f of A.falls) {
      const p = clamp((t - f.t0) / f.dur, 0, 1);
      const e = easeOutBack(p);
      const x = ox + (f.from.c + (f.to.c - f.from.c) * e) * cs;
      const y = oy + (f.from.r + (f.to.r - f.from.r) * e) * cs;
      drawCellAt(ctx, f.cell, x, y, cs, { variant: VARIANT[f.to.r] ? VARIANT[f.to.r][f.to.c] : 0, time: t });
    }
    // 交换精灵
    for (const sp of swapSprites) {
      drawCellAt(ctx, sp.cell, sp.x, sp.y, cs, { variant: VARIANT[sp.vr] ? VARIANT[sp.vr][sp.vc] : 0, time: t });
    }

    // 炸弹波及闪光（手动管理透明度，免 save/restore）
    for (const f of A.flashes) {
      const p = clamp((t - f.t0) / f.dur, 0, 1);
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.fillStyle = '#FFFFFF';
      rr(ctx, ox + f.c * cs + cs * 0.08, oy + f.r * cs + cs * 0.08, cs * 0.84, cs * 0.84, cs * 0.26);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 冰碎 / 链开特效
    if (A.cracks.length) {
      ctx.strokeStyle = '#BEE6FF';
      ctx.lineWidth = Math.max(1.5, cs * 0.05); ctx.lineCap = 'round';
      for (const c of A.cracks) {
        const p = clamp((t - c.t0) / c.dur, 0, 1);
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = c.ice ? '#BEE6FF' : '#B9B9C8';
        const cx = ox + c.c * cs + cs / 2, cy = oy + c.r * cs + cs / 2, R = cs * (0.2 + p * 0.45);
        for (let i = 0; i < 5; i++) {
          const ang = (Math.PI * 2 / 5) * i + 0.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // 彩虹扩散环
    if (A.rings.length) {
      const seg = Math.PI * 2 / RAINBOW_HUES.length;
      for (const rg of A.rings) {
        const p = clamp((t - rg.t0) / rg.dur, 0, 1);
        ctx.globalAlpha = 1 - p;
        const cx = ox + rg.c * cs + cs / 2, cy = oy + rg.r * cs + cs / 2;
        ctx.lineWidth = cs * 0.14 * (1 - p * 0.5); ctx.lineCap = 'butt';
        const R = cs * (0.4 + p * 5);
        for (let i = 0; i < RAINBOW_HUES.length; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, R, i * seg, (i + 1) * seg - 0.05);
          ctx.strokeStyle = RAINBOW_HUES[i];
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // 目标选择高亮（呼吸金框）
    if (this.highlight && this.highlight.length) {
      const pulse = 0.55 + 0.45 * Math.sin(t / 160);
      ctx.save();
      ctx.lineWidth = Math.max(2, cs * 0.07);
      ctx.strokeStyle = `rgba(255, 200, 60, ${pulse})`;
      for (const hcell of this.highlight) {
        if (!hcell) continue;
        rr(ctx, ox + hcell.c * cs + cs * 0.05, oy + hcell.r * cs + cs * 0.05, cs * 0.9, cs * 0.9, cs * 0.26);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();

    // ===== 特效层（不随棋盘震动）：rowLock / fog / wind / 粒子 / 飘字 / 全屏闪光 =====
    this._drawFxLayer(ctx, t, W, H, cs, ox, oy, rows, pad);
  }

  _drawFxLayer(ctx, t, W, H, cs, ox, oy, rows, pad) {
    const A = this.anims;
    const bw = cs * 8, bh = cs * 8;

    // 行锁定：半透明灰覆盖 + 锁图标（持续状态，每帧绘制）
    if (this.lockedRows && this.lockedRows.size) {
      for (const r of this.lockedRows) {
        if (!(r >= 0 && r < rows)) continue;
        const y = oy + r * cs;
        ctx.fillStyle = 'rgba(70,70,82,.4)';
        ctx.fillRect(ox, y, bw, cs);
        const cx = ox + bw / 2, cy = y + cs * 0.52;
        const lw = cs * 0.26, lh = cs * 0.2;
        ctx.strokeStyle = 'rgba(255,255,255,.92)';
        ctx.lineWidth = Math.max(1.5, cs * 0.055);
        ctx.beginPath(); ctx.arc(cx, cy - lh * 0.1, lw * 0.3, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        rr(ctx, cx - lw / 2, cy - lh * 0.1, lw, lh, lw * 0.2); ctx.fill();
        ctx.fillStyle = 'rgba(70,70,82,.9)';
        ctx.beginPath(); ctx.arc(cx, cy + lh * 0.32, Math.max(1.2, lw * 0.1), 0, Math.PI * 2); ctx.fill();
      }
    }

    // 边缘白雾：四周向内 1.5 格（持续状态，每帧绘制；双层模拟柔和边缘，无渐变对象）
    if (this.fogOn) {
      const fw = cs * 1.5;
      const a0 = 0.55 + 0.05 * Math.sin(t / 480);
      ctx.fillStyle = `rgba(250,250,255,${a0.toFixed(3)})`;
      ctx.fillRect(ox - pad, oy - pad, bw + pad * 2, fw + pad);           // 上
      ctx.fillRect(ox - pad, oy + bh - fw, bw + pad * 2, fw + pad);      // 下
      ctx.fillRect(ox - pad, oy - pad, fw + pad, bh + pad * 2);          // 左
      ctx.fillRect(ox + bw - fw, oy - pad, fw + pad, bh + pad * 2);      // 右
      ctx.fillStyle = `rgba(250,250,255,${(a0 * 0.55).toFixed(3)})`;
      const fw2 = fw * 0.55;
      ctx.fillRect(ox, oy + fw2 - cs * 0.2, bw, fw2);                    // 上内
      ctx.fillRect(ox, oy + bh - fw * 0.98, bw, fw2);                    // 下内
      ctx.fillRect(ox + fw2 - cs * 0.2, oy, fw2, bh);                    // 左内
      ctx.fillRect(ox + bw - fw * 0.98, oy, fw2, bh);                    // 右内
    }

    // 气流风线：3 条白线从顶到底扫过该列
    if (A.winds.length) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = Math.max(2, cs * 0.1);
      for (const w of A.winds) {
        const p = clamp((t - w.t0) / w.dur, 0, 1);
        const head = oy - cs * 0.5 + p * (bh + cs);
        const tail = head - cs * 1.4;
        ctx.globalAlpha = (1 - p) * 0.9;
        for (const o of [0.28, 0.5, 0.72]) {
          const x = ox + w.col * cs + cs * o;
          ctx.beginPath();
          ctx.moveTo(x, Math.max(oy - pad, tail));
          ctx.lineTo(x, Math.min(oy + bh, head));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // 金色粒子喷泉（宝箱）
    if (A.parts.length) {
      ctx.fillStyle = '#FFD35C';
      for (const p of A.parts) {
        const dt = (t - p.t0) / 1000;
        const x = p.x0 + p.vx * dt;
        const y = p.y0 + p.vy * dt + 0.5 * p.g * dt * dt;
        ctx.globalAlpha = clamp(1 - (t - p.t0) / p.dur, 0, 1);
        ctx.beginPath(); ctx.arc(x, y, p.rad, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 画布内飘字（伤害红/治疗绿/金币金），上浮淡出
    if (A.floats.length) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const fs = Math.max(14, cs * 0.34);
      ctx.font = `900 ${fs}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      for (const f of A.floats) {
        const p = clamp((t - f.t0) / f.dur, 0, 1);
        const y = f.y - easeOut(p) * 36;
        ctx.globalAlpha = 1 - p * p;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.92)';
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, y);
      }
      ctx.globalAlpha = 1;
    }

    // 技能释放：全屏该色柔光闪烁 + 棋盘边缘光晕（400ms）
    if (this._fxSkill) {
      const f = this._fxSkill, ft = t - f.t0;
      if (ft > f.dur) this._fxSkill = null;
      else {
        const a = Math.sin((ft / f.dur) * Math.PI);
        const col = CELL_COLORS[f.color] || CELL_COLORS[3];
        ctx.fillStyle = rgba(col.base, a * 0.22);
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalAlpha = a * 0.9;
        ctx.lineWidth = Math.max(3, cs * 0.12);
        ctx.strokeStyle = col.light;
        ctx.shadowColor = col.base; ctx.shadowBlur = 18;
        rr(ctx, ox - pad, oy - pad, bw + pad * 2, bh + pad * 2, cs * 0.42);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Boss 技能：全屏红闪 2 次 + 大字名字从中心放大淡出
    if (this._fxBoss) {
      const f = this._fxBoss, ft = t - f.t0;
      if (ft > f.dur) this._fxBoss = null;
      else {
        const fp = ft / f.dur;
        let a = 0;
        for (const [s0, s1] of [[0, 0.22], [0.36, 0.58]]) {
          if (fp >= s0 && fp < s1) { a = Math.sin(((fp - s0) / (s1 - s0)) * Math.PI) * 0.45; break; }
        }
        if (a > 0) {
          ctx.fillStyle = `rgba(255,60,50,${a.toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }
        const tp = clamp(ft / f.dur, 0, 1);
        const scale = 0.6 + easeOut(tp) * 0.9;
        ctx.save();
        ctx.globalAlpha = 1 - tp;
        ctx.translate(W / 2, H / 2);
        ctx.scale(scale, scale);
        ctx.font = `900 ${Math.max(24, cs * 0.9)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#7A1010';
        ctx.strokeText(f.name, 0, 0);
        ctx.fillStyle = '#FFE1E1';
        ctx.fillText(f.name, 0, 0);
        ctx.restore();
      }
    }
  }

  // 消除爆裂：缩放淡出的表情 + 星星（方块本体走精灵缓存，无渐变）
  _drawPop(ctx, pop, x, y, cs, t) {
    const p = clamp((t - pop.t0) / pop.dur, 0, 1);
    const col = CELL_COLORS[pop.color] || CELL_COLORS[0];
    const cx = x + cs / 2, cy = y + cs / 2;
    const g0 = ctx.globalAlpha;
    ctx.globalAlpha = g0 * (1 - p);
    // 冲击圈
    ctx.strokeStyle = col.light;
    ctx.lineWidth = Math.max(1.5, cs * 0.07 * (1 - p));
    ctx.beginPath(); ctx.arc(cx, cy, cs * (0.3 + p * 0.55), 0, Math.PI * 2); ctx.stroke();
    // 放大淡出的方块（缓存精灵整体缩放）
    const special = pop.special || null;
    const frame = special === 'rainbow' ? Math.floor(t / RAINBOW_FRAME_MS) % RAINBOW_FRAMES : 0;
    const sp = getSprite(cs, _dpr, pop.color || 0, (pop.r * 31 + pop.c * 17) % 4, 0, 0, special, frame);
    if (sp) {
      const s = sp.size * (1 + p * 0.5);
      ctx.drawImage(sp.cv, cx - s / 2, cy - s / 2, s, s);
    } else {
      const s = cs * (1 + p * 0.5);
      _paintCellBody(ctx, cs, pop.color || 0, (pop.r * 31 + pop.c * 17) % 4, special, frame);
    }
    // 星星飞溅
    ctx.fillStyle = '#FFE066';
    for (let i = 0; i < 5; i++) {
      const ang = (Math.PI * 2 / 5) * i + pop.t0 % 7;
      const R = cs * (0.3 + p * 0.62);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, cs * 0.06 * (1 - p * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = g0;
  }

  // ============================================================
  // V2.3 特效 API
  // ============================================================

  /**
   * 统一特效入口，返回 Promise（特效播放完毕/状态生效后 resolve）
   *  kind: 'skillCast'   opts {charId, color}  全屏该色柔光闪烁+棋盘边缘光晕 400ms
   *        'bossSkill'   opts {name}           全屏红闪 2 次 + shake + 大字放大淡出
   *        'enemyAttack' opts {idx}            画布内仅轻震（敌人卡动画由 main 层 CSS 负责）
   *        'treasure'    opts {r, c}           该格金光粒子喷泉
   *        'wind'        opts {col}            3 条白色风线从顶到底扫过该列 250ms
   *        'fog'         opts {on}             持续状态，等价 setFog(on)
   *        'rowLock'     opts {rows}           持续状态，等价 setRowLocks(rows)
   */
  async playFx(kind, opts = {}) {
    const now = () => performance.now();
    switch (kind) {
      case 'skillCast':
        this._fxSkill = { t0: now(), dur: 400, color: opts.color | 0, charId: opts.charId || null };
        await sleep(400);
        break;
      case 'bossSkill':
        this.shake();
        this._fxBoss = { t0: now(), dur: 660, name: String(opts.name || 'BOSS') };
        await sleep(680);
        break;
      case 'enemyAttack':
        this.shake();
        await sleep(200);
        break;
      case 'treasure':
        this._burstGold(opts.r | 0, opts.c | 0, 14);
        await sleep(620);
        break;
      case 'wind':
        this.anims.winds.push({ col: opts.col | 0, t0: now(), dur: 250 });
        await sleep(250);
        break;
      case 'fog':
        this.setFog(!!opts.on);
        break;
      case 'rowLock':
        this.setRowLocks(opts.rows || []);
        break;
      default:
        break;
    }
    this._gc(performance.now());
    this.drawIdle();
  }

  /**
   * 画布内飘字（替代 DOM 方案）。cssX/cssY 为画布 CSS 像素坐标。
   * cls: 'dmg'/'hurt' 红 | 'heal' 绿 | 'gold'/'coin' 金 | 其他 白
   * 600ms 上浮淡出。
   */
  floatText(text, cssX, cssY, cls = 'dmg') {
    const colors = {
      dmg: '#FF5252', hurt: '#FF5252', heal: '#4CD97B',
      gold: '#FFC93D', coin: '#FFC93D', crit: '#FF8F3D',
    };
    const A = this.anims;
    if (A.floats.length > 24) A.floats.shift();
    A.floats.push({
      text: String(text), x: cssX, y: cssY,
      color: colors[cls] || '#FFFDF6',
      t0: performance.now(), dur: 600,
    });
  }
}

// ============================================================
// 呆萌角色立绘（7 角色，纯几何绘制）
// ============================================================
export function drawAvatar(ctx, charId, x, y, size) {
  const s = size / 2; // 半径基准
  ctx.save();
  ctx.translate(x, y);
  // 地面小影子
  ctx.fillStyle = 'rgba(150,100,30,.14)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.92, s * 0.5, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();

  const painters = {
    hajimiao: avHajimiao, dasangwang: avDasangwang, feitianxia: avFeitianxia,
    zhuanzhuanjun: avZhuanzhuanjun, zifengzhiwang: avZifengzhiwang,
    xiaoniu: avXiaoniu, mianshifu: avMianshifu,
  };
  (painters[charId] || avHajimiao)(ctx, s);
  ctx.restore();
}

// —— 哈基喵：橘猫 + 蜂蜜罐 ——
function avHajimiao(ctx, s) {
  // 蜂蜜罐（头顶飘）
  ctx.save();
  ctx.translate(0, -s * 0.78);
  ctx.fillStyle = '#E89B2B';
  rr(ctx, -s * 0.16, -s * 0.1, s * 0.32, s * 0.26, s * 0.06); ctx.fill();
  ctx.fillStyle = '#C87F16';
  rr(ctx, -s * 0.19, -s * 0.16, s * 0.38, s * 0.09, s * 0.04); ctx.fill();
  ctx.fillStyle = '#FFD37A';
  ctx.beginPath(); ctx.ellipse(s * 0.14, s * 0.2, s * 0.035, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.font = `bold ${s * 0.12}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('蜜', 0, s * 0.08);
  ctx.restore();
  // 耳朵
  ctx.fillStyle = '#F59B37';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * s * 0.42, -s * 0.18);
    ctx.lineTo(d * s * 0.6, -s * 0.62);
    ctx.lineTo(d * s * 0.12, -s * 0.42);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#FFC7A0';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * s * 0.4, -s * 0.26);
    ctx.lineTo(d * s * 0.51, -s * 0.52);
    ctx.lineTo(d * s * 0.2, -s * 0.38);
    ctx.closePath(); ctx.fill();
  }
  // 头
  const g = ctx.createRadialGradient(-s * 0.1, -s * 0.15, s * 0.1, 0, 0, s * 0.5);
  g.addColorStop(0, '#FFC069'); g.addColorStop(1, '#F59B37');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2); ctx.fill();
  // 条纹
  ctx.strokeStyle = 'rgba(200,120,20,.55)'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  for (const dx of [-0.22, 0, 0.22]) {
    ctx.beginPath(); ctx.arc(dx * s, -s * 0.34, s * 0.1, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  }
  // 呆滞大眼 + 嘴
  ctx.fillStyle = '#3A2A18';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.18, -s * 0.02, s * 0.055, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(d * s * 0.18 - s * 0.02, -s * 0.05, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3A2A18';
  }
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-s * 0.05, s * 0.13, s * 0.045, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.05, s * 0.13, s * 0.045, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // 腮红 + 胡须
  ctx.fillStyle = 'rgba(255,110,130,.4)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.3, s * 0.1, s * 0.07, s * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,75,20,.5)'; ctx.lineWidth = s * 0.025;
  for (const d of [-1, 1]) for (const dy of [-0.02, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(d * s * 0.4, s * dy * 1);
    ctx.lineTo(d * s * 0.58, s * (dy - 0.03));
    ctx.stroke();
  }
}

// —— 大狗旺：黄柴犬张大嘴 ——
function avDasangwang(ctx, s) {
  // 耳朵
  ctx.fillStyle = '#E8A83C';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(d * s * 0.38, -s * 0.3, s * 0.12, s * 0.2, d * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  // 头
  const g = ctx.createRadialGradient(-s * 0.1, -s * 0.15, s * 0.1, 0, 0, s * 0.52);
  g.addColorStop(0, '#FFDB7A'); g.addColorStop(1, '#F5B93B');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2); ctx.fill();
  // 眉间白纹
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.ellipse(0, -s * 0.22, s * 0.1, s * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  // 眯眯笑眼
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(d * s * 0.2, -s * 0.06, s * 0.08, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  // 超大张嘴
  ctx.fillStyle = '#8C3B2E';
  ctx.beginPath(); ctx.ellipse(0, s * 0.24, s * 0.26, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  // 舌头
  ctx.fillStyle = '#FF8FA3';
  ctx.beginPath(); ctx.ellipse(0, s * 0.34, s * 0.13, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  // 小虎牙
  ctx.fillStyle = '#FFF';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * s * 0.16, s * 0.1);
    ctx.lineTo(d * s * 0.1, s * 0.1);
    ctx.lineTo(d * s * 0.13, s * 0.2);
    ctx.closePath(); ctx.fill();
  }
  // 脖子小喇叭
  ctx.save();
  ctx.translate(s * 0.5, s * 0.55); ctx.rotate(0.5);
  ctx.fillStyle = '#9AA7B8';
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, -s * 0.1); ctx.lineTo(s * 0.04, -s * 0.1);
  ctx.lineTo(s * 0.14, s * 0.12); ctx.lineTo(-s * 0.14, s * 0.12);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6C7A8C'; ctx.lineWidth = s * 0.025;
  ctx.beginPath(); ctx.arc(s * 0.22, s * 0.06, s * 0.08, -0.9, 0.9); ctx.stroke();
  ctx.restore();
  // 腮红
  ctx.fillStyle = 'rgba(255,110,130,.4)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.32, s * 0.02, s * 0.06, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// —— 飞天侠：红斗篷小人 ——
function avFeitianxia(ctx, s) {
  // 斗篷（身后）
  ctx.fillStyle = '#E84A4A';
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, -s * 0.1);
  ctx.lineTo(-s * 0.6, s * 0.55);
  ctx.lineTo(0, s * 0.36);
  ctx.lineTo(s * 0.6, s * 0.55);
  ctx.lineTo(s * 0.34, -s * 0.1);
  ctx.closePath(); ctx.fill();
  // 斗篷上的星星
  ctx.fillStyle = '#FFE066';
  ctx.beginPath();
  ctx.arc(-s * 0.22, s * 0.28, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.26, s * 0.36, s * 0.04, 0, Math.PI * 2); ctx.fill();
  // 身体
  ctx.fillStyle = '#FFFDF6';
  rr(ctx, -s * 0.22, s * 0.05, s * 0.44, s * 0.42, s * 0.16); ctx.fill();
  ctx.strokeStyle = '#E8D5AE'; ctx.lineWidth = s * 0.02; ctx.stroke();
  // 头
  ctx.fillStyle = '#FFE3C8';
  ctx.beginPath(); ctx.arc(0, -s * 0.22, s * 0.3, 0, Math.PI * 2); ctx.fill();
  // 头发
  ctx.fillStyle = '#5A4632';
  ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.3, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  // 自信眼神（斜眉）
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.3); ctx.lineTo(-s * 0.07, -s * 0.25);
  ctx.moveTo(s * 0.18, -s * 0.3); ctx.lineTo(s * 0.07, -s * 0.25);
  ctx.stroke();
  ctx.fillStyle = '#3A2A18';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(d * s * 0.11, -s * 0.2, s * 0.035, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.05, 0.2, Math.PI - 0.2); ctx.stroke();
  // 脚下火焰
  for (const d of [-1, 1]) {
    const fg = ctx.createRadialGradient(d * s * 0.18, s * 0.6, s * 0.02, d * s * 0.18, s * 0.6, s * 0.14);
    fg.addColorStop(0, '#FFE066'); fg.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(d * s * 0.18, s * 0.6, s * 0.13, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// —— 转转君：转盘头机器人 ——
function avZhuanzhuanjun(ctx, s) {
  // 身体
  ctx.fillStyle = '#B8C6D8';
  rr(ctx, -s * 0.26, s * 0.08, s * 0.52, s * 0.46, s * 0.14); ctx.fill();
  ctx.strokeStyle = '#8CA0B8'; ctx.lineWidth = s * 0.025; ctx.stroke();
  // 身上的小彩旗
  const flagCols = ['#FF6B6B', '#FFD93D', '#6BCB77'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = flagCols[i];
    ctx.beginPath();
    ctx.moveTo(-s * 0.16 + i * s * 0.16, s * 0.2);
    ctx.lineTo(-s * 0.06 + i * s * 0.16, s * 0.2);
    ctx.lineTo(-s * 0.11 + i * s * 0.16, s * 0.32);
    ctx.closePath(); ctx.fill();
  }
  // 天线
  ctx.strokeStyle = '#8CA0B8'; ctx.lineWidth = s * 0.035;
  ctx.beginPath(); ctx.moveTo(0, -s * 0.52); ctx.lineTo(0, -s * 0.66); ctx.stroke();
  ctx.fillStyle = '#FF6B6B';
  ctx.beginPath(); ctx.arc(0, -s * 0.7, s * 0.06, 0, Math.PI * 2); ctx.fill();
  // 转盘头（四色扇叶）
  const rot = Math.PI / 8;
  const segCols = ['#FF6B6B', '#FFD93D', '#6BCB77', '#5BA8FF'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = segCols[i];
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.22);
    ctx.arc(0, -s * 0.22, s * 0.3, rot + i * Math.PI / 2, rot + (i + 1) * Math.PI / 2 - 0.03);
    ctx.closePath(); ctx.fill();
  }
  // 白色轴心脸
  ctx.fillStyle = '#FFFDF6';
  ctx.beginPath(); ctx.arc(0, -s * 0.22, s * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3A2A18';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(d * s * 0.05, -s * 0.25, s * 0.022, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.02; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -s * 0.19, s * 0.045, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,110,130,.4)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(d * s * 0.1, -s * 0.17, s * 0.025, 0, Math.PI * 2); ctx.fill();
  }
}

// —— 自封之王：黑背心 + 纸王冠 ——
function avZifengzhiwang(ctx, s) {
  // 身体 + 黑背心
  ctx.fillStyle = '#FFE3C8';
  rr(ctx, -s * 0.26, s * 0.1, s * 0.52, s * 0.44, s * 0.16); ctx.fill();
  ctx.fillStyle = '#3A3A44';
  ctx.beginPath();
  ctx.moveTo(-s * 0.26, s * 0.14);
  ctx.lineTo(-s * 0.26, s * 0.54); ctx.lineTo(-s * 0.06, s * 0.54);
  ctx.lineTo(-s * 0.06, s * 0.2);
  ctx.lineTo(s * 0.06, s * 0.2);
  ctx.lineTo(s * 0.06, s * 0.54); ctx.lineTo(s * 0.26, s * 0.54);
  ctx.lineTo(s * 0.26, s * 0.14);
  ctx.closePath(); ctx.fill();
  // 玩具剑
  ctx.save();
  ctx.translate(s * 0.44, s * 0.3); ctx.rotate(-0.5);
  ctx.fillStyle = '#C8D2DC';
  rr(ctx, -s * 0.03, -s * 0.3, s * 0.06, s * 0.34, s * 0.02); ctx.fill();
  ctx.fillStyle = '#F5B93B';
  rr(ctx, -s * 0.09, s * 0.02, s * 0.18, s * 0.05, s * 0.02); ctx.fill();
  rr(ctx, -s * 0.025, s * 0.06, s * 0.05, s * 0.12, s * 0.02); ctx.fill();
  ctx.restore();
  // 头
  ctx.fillStyle = '#FFE3C8';
  ctx.beginPath(); ctx.arc(0, -s * 0.24, s * 0.3, 0, Math.PI * 2); ctx.fill();
  // 歪歪扭扭纸王冠
  ctx.save();
  ctx.translate(s * 0.03, -s * 0.62); ctx.rotate(0.14);
  ctx.fillStyle = '#FFD93D';
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, s * 0.1);
  ctx.lineTo(-s * 0.2, -s * 0.06); ctx.lineTo(-s * 0.1, s * 0.0);
  ctx.lineTo(0, -s * 0.12); ctx.lineTo(s * 0.1, s * 0.0);
  ctx.lineTo(s * 0.2, -s * 0.06); ctx.lineTo(s * 0.2, s * 0.1);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#E2AC18'; ctx.lineWidth = s * 0.02; ctx.stroke();
  ctx.restore();
  // 严肃小眉 + 撅嘴
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.32); ctx.lineTo(-s * 0.07, -s * 0.28);
  ctx.moveTo(s * 0.18, -s * 0.32); ctx.lineTo(s * 0.07, -s * 0.28);
  ctx.stroke();
  ctx.fillStyle = '#3A2A18';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(d * s * 0.11, -s * 0.22, s * 0.032, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.05, Math.PI + 0.4, Math.PI * 2 - 0.4); ctx.stroke();
  // 腮红
  ctx.fillStyle = 'rgba(255,110,130,.35)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.22, -s * 0.12, s * 0.05, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// —— 小牛：粉斑奶牛 ——
function avXiaoniu(ctx, s) {
  // 小角
  ctx.fillStyle = '#F5DEB8';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(d * s * 0.26, -s * 0.4, s * 0.08, Math.PI * 1.1, Math.PI * 1.9);
    ctx.fill();
  }
  // 头
  ctx.fillStyle = '#FFFDF6';
  ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#EAD9BC'; ctx.lineWidth = s * 0.015; ctx.stroke();
  // 粉色斑块
  ctx.fillStyle = '#FFC7D8';
  ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.22, s * 0.15, s * 0.11, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.34, s * 0.2, s * 0.12, s * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
  // 粉蝴蝶结
  ctx.fillStyle = '#FF8FAF';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(d * s * 0.09 + s * 0.3, -s * 0.36, s * 0.08, s * 0.055, d * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#F26B93';
  ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.36, s * 0.035, 0, Math.PI * 2); ctx.fill();
  // 水汪汪大眼（含泪光）
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#3A2A18';
    ctx.beginPath(); ctx.arc(d * s * 0.18, -s * 0.04, s * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.arc(d * s * 0.16, -s * 0.07, s * 0.032, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,220,255,.8)';
    ctx.beginPath(); ctx.arc(d * s * 0.21, s * 0.02, s * 0.02, 0, Math.PI * 2); ctx.fill();
  }
  // 泪滴
  ctx.fillStyle = 'rgba(140,210,255,.85)';
  ctx.beginPath(); ctx.ellipse(-s * 0.26, s * 0.06, s * 0.025, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  // 口鼻
  ctx.fillStyle = '#FFD3E0';
  ctx.beginPath(); ctx.ellipse(0, s * 0.24, s * 0.2, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E88AA8';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.07, s * 0.23, s * 0.025, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, s * 0.32, s * 0.04, 0.2, Math.PI - 0.2); ctx.stroke();
}

// —— 面师傅：厨师帽 + 大锅 ——
function avMianshifu(ctx, s) {
  // 背后大锅 + 热气
  ctx.fillStyle = '#6C7684';
  ctx.beginPath(); ctx.ellipse(s * 0.3, s * 0.4, s * 0.3, s * 0.2, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8C97A6';
  rr(ctx, s * 0.04, s * 0.28, s * 0.52, s * 0.08, s * 0.04); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
  for (const dx of [0.24, 0.38]) {
    ctx.beginPath();
    ctx.moveTo(s * dx, s * 0.18);
    ctx.quadraticCurveTo(s * (dx + 0.06), s * 0.08, s * dx, s * 0.0);
    ctx.stroke();
  }
  // 身体 + 围裙（写"忘情"）
  ctx.fillStyle = '#FFFDF6';
  rr(ctx, -s * 0.24, s * 0.14, s * 0.48, s * 0.4, s * 0.14); ctx.fill();
  ctx.fillStyle = '#F5E6C8';
  rr(ctx, -s * 0.16, s * 0.22, s * 0.32, s * 0.28, s * 0.1); ctx.fill();
  ctx.fillStyle = '#8A6A3C';
  ctx.font = `bold ${s * 0.11}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('忘情', 0, s * 0.4);
  // 头
  ctx.fillStyle = '#FFE3C8';
  ctx.beginPath(); ctx.arc(0, -s * 0.18, s * 0.28, 0, Math.PI * 2); ctx.fill();
  // 厨师帽
  ctx.fillStyle = '#FFFDF6';
  for (const [dx, dy, r] of [[-0.14, -0.62, 0.12], [0, -0.68, 0.14], [0.14, -0.62, 0.12]]) {
    ctx.beginPath(); ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
  rr(ctx, -s * 0.2, -s * 0.56, s * 0.4, s * 0.12, s * 0.05); ctx.fill();
  ctx.strokeStyle = '#EAD9BC'; ctx.lineWidth = s * 0.018;
  rr(ctx, -s * 0.2, -s * 0.56, s * 0.4, s * 0.12, s * 0.05); ctx.stroke();
  // 安详闭眼 + 微笑
  ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.arc(d * s * 0.11, -s * 0.16, s * 0.05, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, -s * 0.06, s * 0.05, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,110,130,.4)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.2, -s * 0.08, s * 0.05, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// 便捷方法：把角色画进指定画布
export function drawAvatarInto(canvas, charId, size) {
  const ctx = prepCanvas(canvas, size, size);
  drawAvatar(ctx, charId, size / 2, size / 2, size * 0.92);
  return ctx;
}

// ============================================================
// 呆萌敌人（按名字生成配色与特征，支持表情变化）
// mood: normal | hurt | stun
// ============================================================
function hashName(name) {
  let h = 0;
  const str = String(name || '怪');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function drawMonster(ctx, name, x, y, size, mood = 'normal') {
  // AI 立绘优先：命中敌人图库则贴图（受击/眩晕轻微倾斜表意）
  const _ekey = enemyArtKey(name);
  if (_ekey && artHas(_ekey)) {
    const tilt = mood === 'hurt' ? -0.12 : (mood === 'stun' ? 0.10 : 0);
    drawArtCentered(ctx, _ekey, x, y, size * 0.96, tilt);
    return;
  }
  const h = hashName(name);
  const hue = h % 360;
  const s = size / 2;
  ctx.save();
  ctx.translate(x, y);
  if (mood === 'hurt') ctx.rotate(0.12);
  // 身体胖团子
  const g = ctx.createRadialGradient(-s * 0.15, -s * 0.2, s * 0.1, 0, 0, s * 0.62);
  g.addColorStop(0, `hsl(${hue}, 78%, 78%)`);
  g.addColorStop(1, `hsl(${hue}, 62%, 56%)`);
  ctx.fillStyle = g;
  rr(ctx, -s * 0.5, -s * 0.42, s, s * 0.92, s * 0.36); ctx.fill();
  // 角/呆毛
  ctx.fillStyle = `hsl(${hue}, 55%, 42%)`;
  const horns = 1 + (h % 3);
  for (let i = 0; i < horns; i++) {
    const hx = (i - (horns - 1) / 2) * s * 0.3;
    ctx.beginPath();
    ctx.moveTo(hx - s * 0.07, -s * 0.38);
    ctx.lineTo(hx, -s * (0.56 + (i % 2) * 0.08));
    ctx.lineTo(hx + s * 0.07, -s * 0.38);
    ctx.closePath(); ctx.fill();
  }
  // 肚皮
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.22, s * 0.26, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();

  const ey = -s * 0.1;
  ctx.strokeStyle = '#3A2A18'; ctx.lineCap = 'round';
  if (mood === 'hurt') {
    // >< 眼
    ctx.lineWidth = s * 0.05;
    for (const d of [-1, 1]) {
      const ex = d * s * 0.18;
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.05, ey - s * 0.05); ctx.lineTo(ex + s * 0.05, ey + s * 0.05);
      ctx.moveTo(ex + s * 0.05, ey - s * 0.05); ctx.lineTo(ex - s * 0.05, ey + s * 0.05);
      ctx.stroke();
    }
    // 波浪嘴
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, s * 0.1);
    ctx.quadraticCurveTo(-s * 0.04, s * 0.06, 0, s * 0.1);
    ctx.quadraticCurveTo(s * 0.04, s * 0.14, s * 0.08, s * 0.1);
    ctx.stroke();
  } else if (mood === 'stun') {
    // 晕圈眼
    ctx.lineWidth = s * 0.035;
    for (const d of [-1, 1]) {
      const ex = d * s * 0.18;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 3.6; a += 0.3) {
        const r = s * 0.02 + a * s * 0.022;
        const px = ex + Math.cos(a) * r, py = ey + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, s * 0.12, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3A2A18'; ctx.fill();
    // 头顶转圈星星
    ctx.fillStyle = '#FFE066';
    for (let i = 0; i < 3; i++) {
      const ang = Math.PI * 0.2 + i * 0.5;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * s * 0.4, -s * 0.5 + Math.sin(ang) * s * 0.12, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 圆亮呆萌眼
    for (const d of [-1, 1]) {
      ctx.fillStyle = '#3A2A18';
      ctx.beginPath(); ctx.arc(d * s * 0.18, ey, s * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.arc(d * s * 0.16, ey - s * 0.03, s * 0.03, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#3A2A18'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.08, 0.25, Math.PI - 0.25); ctx.stroke();
  }
  // 腮红
  ctx.fillStyle = 'rgba(255,110,130,.4)';
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * s * 0.32, s * 0.06, s * 0.07, s * 0.045, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawMonsterInto(canvas, name, size, mood = 'normal') {
  const ctx = prepCanvas(canvas, size, size);
  drawMonster(ctx, name, size / 2, size / 2, size * 0.94, mood);
  return ctx;
}

// ============================================================
// LOGO：彩虹 + 呆萌标题字
// ============================================================
export function drawLogo(canvas, cssW, cssH) {
  const ctx = prepCanvas(canvas, cssW, cssH);
  // AI Logo 优先：assets/logo.png 就绪则整幅贴图
  const _logo = logoArt();
  if (_logo) {
    const lr = _logo.width / _logo.height;
    let lw = cssW * 0.98, lh = lw / lr;
    if (lh > cssH * 0.92) { lh = cssH * 0.92; lw = lh * lr; }
    ctx.drawImage(_logo, (cssW - lw) / 2, (cssH - lh) / 2, lw, lh);
    return ctx;
  }
  const cx = cssW / 2;
  const arcY = cssH * 0.52;
  // 彩虹拱
  ctx.lineCap = 'round';
  for (let i = 0; i < RAINBOW_HUES.length; i++) {
    ctx.beginPath();
    ctx.arc(cx, arcY, cssH * (0.52 - i * 0.055), Math.PI, Math.PI * 2);
    ctx.strokeStyle = RAINBOW_HUES[i];
    ctx.lineWidth = cssH * 0.05;
    ctx.stroke();
  }
  // 两端呆萌云朵
  for (const d of [-1, 1]) {
    const wx = cx + d * cssH * 0.56;
    ctx.fillStyle = '#FFFDF6';
    ctx.beginPath();
    ctx.arc(wx, arcY - cssH * 0.1, cssH * 0.13, 0, Math.PI * 2);
    ctx.arc(wx - d * cssH * 0.14, arcY - cssH * 0.04, cssH * 0.1, 0, Math.PI * 2);
    ctx.arc(wx + d * cssH * 0.13, arcY - cssH * 0.03, cssH * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // 云朵小脸
    drawFace(ctx, wx, arcY - cssH * 0.08, cssH * 0.16, 0);
  }
  // 标题字（逐字彩色 + 白描边）
  const text = '梗灵大陆';
  const cols = ['#FF6B6B', '#FF9F45', '#6BCB77', '#5BA8FF'];
  const fs = cssH * 0.3;
  ctx.font = `900 ${fs}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const total = cssW * 0.62;
  const startX = cx - total / 2 + total / 8;
  for (let i = 0; i < text.length; i++) {
    const x = startX + (i * total) / 4;
    const y = cssH * 0.78 + Math.sin(i * 1.3) * cssH * 0.03;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(i * 2.1) * 0.08);
    ctx.lineWidth = fs * 0.18;
    ctx.strokeStyle = '#FFFDF6';
    ctx.strokeText(text[i], 0, 0);
    ctx.lineWidth = fs * 0.045;
    ctx.strokeStyle = 'rgba(120,75,20,.7)';
    ctx.strokeText(text[i], 0, 0);
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  return ctx;
}
