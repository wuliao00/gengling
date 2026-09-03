// ============================================================
// js/ui/avatars.js —— 《梗灵大陆》Q 版(chibi)角色立绘模块（自包含）
//
// 美术规范（对齐流行三消游戏 chibi 立绘）：
//   - 大头小身，头身比约 1:1
//   - 玻璃感大眼：深色瞳孔渐变 + 大高光(左上) + 小高光(右下) + 下睫毛
//   - 径向/线性渐变上色制造体积感，深色描边 #5A3A20（线宽 = size*0.02）
//   - 丰富服装细节 + 萌系道具（蜂蜜罐/喇叭/斗篷/转盘/纸王冠/奶瓶/大锅）
//   - 完整站姿：身体 + 小手小脚，脚下椭圆软阴影
//
// 导出：
//   drawAvatar(ctx, charId, x, y, size, opts={pose:'idle'|'attack'|'happy', blink})
//   drawAvatarAnim(canvas, charId, size) -> stop()
//   drawPortrait(canvas, charId, w, h)   —— 详情页大立绘
// 不依赖 render.js：顶部自带 prepCanvas / rr 等小工具。
// ============================================================

import { drawArtCentered, charArtKey, artHas } from './art.js';

// 统一深色描边色（暖棕，比纯黑更萌）
const OUTLINE = '#5A3A20';

// ===== 小工具（自包含，不 import render.js） =====

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

// 高分屏画布准备（自包含版本，行为与 render.js 一致）
function prepCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// 圆 / 椭圆路径
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }

// 填充 + 描边（描边色/线宽由调用方保证为 OUTLINE / o.lw）
function fs(ctx, fill) { if (fill) ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }

// 恢复标准描边状态
function st(ctx, o) {
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = o.lw;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}

// 五角星路径
function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// 脚下椭圆软阴影（径向渐变，边缘羽化）
function softShadow(ctx, s) {
  const g = ctx.createRadialGradient(0, s * 0.84, 0, 0, s * 0.84, s * 0.42);
  g.addColorStop(0, 'rgba(90,58,32,.32)');
  g.addColorStop(1, 'rgba(90,58,32,0)');
  ctx.fillStyle = g;
  ell(ctx, 0, s * 0.84, s * 0.42, s * 0.09);
  ctx.fill();
}

// 头部径向渐变（左上受光 → 右下深色，体积感）
function headGrad(ctx, s, hi, lo) {
  const g = ctx.createRadialGradient(-s * 0.14, -0.44 * s, s * 0.08, 0, -0.30 * s, s * 0.52);
  g.addColorStop(0, hi); g.addColorStop(1, lo);
  return g;
}

// 身体竖向渐变
function bodyGrad(ctx, s, hi, lo) {
  const g = ctx.createLinearGradient(0, 0.02 * s, 0, 0.70 * s);
  g.addColorStop(0, hi); g.addColorStop(1, lo);
  return g;
}

// ============================================================
// 通用五官部件
// ============================================================

// 玻璃感大眼：虹膜渐变 + 瞳孔 + 双高光 + 下睫毛 + 泪光(可选)
function glassEye(ctx, x, y, rx, ry, o, cfg = {}) {
  st(ctx, o);
  // 虹膜：上深下亮渐变（玻璃透光感）
  const g = ctx.createLinearGradient(x, y - ry, x, y + ry);
  g.addColorStop(0, cfg.irisTop || '#6B4A2A');
  g.addColorStop(0.55, cfg.iris || '#8A5A2E');
  g.addColorStop(1, cfg.irisBot || '#D89A55');
  ctx.fillStyle = g;
  ell(ctx, x, y, rx * 0.92, ry * 0.94); ctx.fill();
  ctx.lineWidth = o.lw * 0.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
  // 瞳孔（深色）
  ctx.fillStyle = '#241812';
  ell(ctx, x, y + ry * 0.10, rx * 0.42, ry * 0.44); ctx.fill();
  // 大高光（左上）
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ell(ctx, x - rx * 0.32, y - ry * 0.36, rx * 0.34, ry * 0.30); ctx.fill();
  // 小高光（右下）
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ell(ctx, x + rx * 0.30, y + ry * 0.36, rx * 0.14, ry * 0.14); ctx.fill();
  // 眼底泪光（水汪汪，小牛专用）
  if (cfg.tear) {
    ctx.fillStyle = 'rgba(170,225,255,.85)';
    ell(ctx, x, y + ry * 0.62, rx * 0.55, ry * 0.26); ctx.fill();
  }
  // 下睫毛（2~3 根短弧）
  ctx.strokeStyle = 'rgba(90,58,32,.9)'; ctx.lineWidth = o.lw * 0.55; ctx.lineCap = 'round';
  for (const dx of [-0.35, 0, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * rx, y + ry * 1.02);
    ctx.lineTo(x + dx * rx * 1.25, y + ry * 1.22);
    ctx.stroke();
  }
}

// 眯眼笑（^ ^）：用于 happy 姿态
function happyEye(ctx, x, y, r, o) {
  st(ctx, o);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.35, r * 1.05, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
}

// 双眼调度：眨眼(闭眼线) → happy(眯眼笑) → 默认玻璃大眼
function eyes(ctx, s, o, cfg = {}) {
  const ex = cfg.ex ?? 0.17, ey = cfg.ey ?? -0.32;
  const rx = s * (cfg.rx ?? 0.085), ry = s * (cfg.ry ?? 0.115);
  for (const d of [-1, 1]) {
    const x = d * s * ex, y = s * ey;
    if ((o.blink || 0) > 0.55) {
      // 眨眼：闭眼弧线
      st(ctx, o);
      ctx.beginPath();
      ctx.arc(x, y - s * 0.02, rx, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      continue;
    }
    if (o.pose === 'happy' && !cfg.keepOpen) { happyEye(ctx, x, y, rx, o); continue; }
    glassEye(ctx, x, y, rx, ry, o, cfg);
  }
}

// 温和拱形眉毛
function brows(ctx, s, o, opt = {}) {
  st(ctx, o);
  ctx.lineWidth = o.lw * 0.9;
  const y = s * (opt.y ?? -0.50), w = s * (opt.w ?? 0.10);
  const tilt = s * (opt.tilt ?? 0.05);
  for (const d of [-1, 1]) {
    const cx = d * s * (opt.ex ?? 0.17);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.8, y + tilt);
    ctx.quadraticCurveTo(cx, y - s * 0.045, cx + w * 0.8, y + tilt);
    ctx.stroke();
  }
}

// 腮红（径向渐变，边缘羽化）
function blush(ctx, x, y, rx, ry, a = 0.45) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(255,110,135,${a})`);
  g.addColorStop(1, 'rgba(255,110,135,0)');
  ctx.fillStyle = g;
  ell(ctx, x, y, rx, ry); ctx.fill();
}

// 小手臂（双描边：先深色轮廓再肢体色），返回两只小手坐标
function arms(ctx, s, o, cfg) {
  const { sx, sy, len, w, color, skin } = cfg;
  const hands = [];
  for (const d of [-1, 1]) {
    // 姿态决定手臂角度：idle 自然下垂 / attack 右臂抬起前挥 / happy 双手高举
    let ang;
    if (o.pose === 'happy') ang = d > 0 ? -1.0 : Math.PI + 1.0;
    else if (o.pose === 'attack') ang = d > 0 ? -0.6 : Math.PI - 1.3;
    else ang = d > 0 ? 1.2 : Math.PI - 1.2;
    const x1 = d * s * sx + Math.cos(ang) * s * len;
    const y1 = s * sy + Math.sin(ang) * s * len;
    // 轮廓层
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = s * w + o.lw * 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d * s * sx, s * sy); ctx.lineTo(x1, y1); ctx.stroke();
    // 肢体层
    ctx.strokeStyle = color; ctx.lineWidth = s * w;
    ctx.beginPath(); ctx.moveTo(d * s * sx, s * sy); ctx.lineTo(x1, y1); ctx.stroke();
    // 小手
    st(ctx, o);
    ctx.fillStyle = skin;
    circ(ctx, x1, y1, s * w * 0.62); fs(ctx);
    hands.push({ x: x1, y: y1 });
  }
  return hands;
}

// 小脚（一对椭圆小鞋子）
function feet(ctx, s, o, color, dx = 0.14, y = 0.76) {
  st(ctx, o);
  ctx.fillStyle = color;
  for (const d of [-1, 1]) {
    ell(ctx, d * s * dx, s * y, s * 0.11, s * 0.075); fs(ctx);
  }
}

// ============================================================
// 萌系道具
// ============================================================

// 蜂蜜罐（哈基喵头顶漂浮：罐身渐变 + 玻璃高光 + 「蜜」字 + 滴落蜜滴）
function honeyJar(ctx, s, o, x, y) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(0.08);
  st(ctx, o);
  // 罐身（琥珀渐变）
  const g = ctx.createLinearGradient(0, -0.12 * s, 0, 0.16 * s);
  g.addColorStop(0, '#FFC84A'); g.addColorStop(1, '#E8940F');
  ctx.fillStyle = g;
  rr(ctx, -0.15 * s, -0.10 * s, 0.30 * s, 0.26 * s, 0.07 * s); fs(ctx);
  // 罐口盖
  ctx.fillStyle = '#C87F16';
  rr(ctx, -0.18 * s, -0.17 * s, 0.36 * s, 0.08 * s, 0.04 * s); fs(ctx);
  // 玻璃高光（竖条）
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  rr(ctx, -0.10 * s, -0.06 * s, 0.05 * s, 0.15 * s, 0.025 * s); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  rr(ctx, 0.06 * s, -0.04 * s, 0.025 * s, 0.09 * s, 0.012 * s); ctx.fill();
  // 字样
  ctx.fillStyle = '#FFF6E0';
  ctx.font = `bold ${s * 0.11}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('蜜', 0.035 * s, 0.04 * s);
  ctx.textBaseline = 'alphabetic';
  ctx.restore(); st(ctx, o);
  // 滴落的蜜滴（带小高光）
  ctx.fillStyle = '#FFC63E';
  ell(ctx, x + 0.02 * s, y + 0.28 * s, s * 0.028, s * 0.045); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ell(ctx, x + 0.012 * s, y + 0.265 * s, s * 0.01, s * 0.015); ctx.fill();
}

// 脖子小喇叭（大狗旺：背带 + 银色喇叭口 + 声波弧线）
function megaphone(ctx, s, o) {
  st(ctx, o);
  // 挂绳背带（交叉在胸前）
  ctx.strokeStyle = '#C87A2A'; ctx.lineWidth = o.lw * 0.9;
  ctx.beginPath();
  ctx.moveTo(-0.18 * s, 0.06 * s); ctx.lineTo(0.16 * s, 0.34 * s);
  ctx.moveTo(0.18 * s, 0.06 * s); ctx.lineTo(-0.10 * s, 0.28 * s);
  ctx.stroke();
  st(ctx, o);
  // 喇叭（挂在胸前偏右）
  ctx.save();
  ctx.translate(0.20 * s, 0.42 * s); ctx.rotate(0.5);
  ctx.fillStyle = '#9AA7B8';
  ctx.beginPath();
  ctx.moveTo(-0.04 * s, -0.10 * s); ctx.lineTo(0.04 * s, -0.10 * s);
  ctx.lineTo(0.14 * s, 0.12 * s); ctx.lineTo(-0.14 * s, 0.12 * s);
  ctx.closePath(); fs(ctx);
  // 喇叭口沿
  ctx.fillStyle = '#C8D2DC';
  rr(ctx, -0.15 * s, 0.10 * s, 0.30 * s, 0.05 * s, 0.02 * s); fs(ctx);
  // 声波弧线
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = o.lw * 0.6;
  ctx.beginPath(); ctx.arc(0.17 * s, 0.06 * s, 0.07 * s, -0.9, 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.17 * s, 0.06 * s, 0.12 * s, -0.8, 0.8); ctx.stroke();
  ctx.restore(); st(ctx, o);
}

// 玩具剑（自封之王：灰剑身 + 高光棱线 + 金护手 + 红柄首）
function toySword(ctx, s, o, x, y) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(-0.55);
  st(ctx, o);
  // 剑身
  const g = ctx.createLinearGradient(-0.03 * s, 0, 0.03 * s, 0);
  g.addColorStop(0, '#DDE5EC'); g.addColorStop(0.5, '#B9C4CE'); g.addColorStop(1, '#98A5B2');
  ctx.fillStyle = g;
  rr(ctx, -0.035 * s, -0.34 * s, 0.07 * s, 0.36 * s, 0.02 * s); fs(ctx);
  // 剑刃中线高光
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = o.lw * 0.5;
  ctx.beginPath(); ctx.moveTo(0, -0.31 * s); ctx.lineTo(0, -0.04 * s); ctx.stroke();
  st(ctx, o);
  // 金护手 + 握柄 + 柄首
  ctx.fillStyle = '#F5B93B';
  rr(ctx, -0.10 * s, 0.005 * s, 0.20 * s, 0.05 * s, 0.02 * s); fs(ctx);
  ctx.fillStyle = '#D83838';
  rr(ctx, -0.028 * s, 0.05 * s, 0.056 * s, 0.11 * s, 0.02 * s); fs(ctx);
  ctx.fillStyle = '#F5B93B';
  circ(ctx, 0, 0.18 * s, 0.035 * s); fs(ctx);
  ctx.restore(); st(ctx, o);
}

// 粉蝴蝶结（小牛：双环 + 中心结 + 缎带尾 + 高光）
function bowKnot(ctx, s, o, x, y, sc = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(0.15);
  st(ctx, o);
  ctx.fillStyle = '#FF8FAF';
  ell(ctx, -0.09 * s * sc, 0, 0.09 * s * sc, 0.06 * s * sc, -0.4); fs(ctx);
  ell(ctx, 0.09 * s * sc, 0, 0.09 * s * sc, 0.06 * s * sc, 0.4); fs(ctx);
  // 缎带尾
  ctx.beginPath();
  ctx.moveTo(-0.03 * s * sc, 0.04 * s * sc);
  ctx.lineTo(-0.07 * s * sc, 0.14 * s * sc);
  ctx.lineTo(0.0, 0.11 * s * sc);
  ctx.lineTo(0.07 * s * sc, 0.15 * s * sc);
  ctx.lineTo(0.03 * s * sc, 0.04 * s * sc);
  ctx.closePath(); fs(ctx);
  // 中心结
  ctx.fillStyle = '#F26B93';
  circ(ctx, 0, 0, 0.04 * s * sc); fs(ctx);
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ell(ctx, -0.10 * s * sc, -0.02 * s * sc, 0.035 * s * sc, 0.02 * s * sc, -0.4); ctx.fill();
  ctx.restore(); st(ctx, o);
}

// 奶瓶（小牛手持：白瓶身 + 牛奶 + 粉瓶盖奶嘴 + 高光）
function milkBottle(ctx, s, o, x, y) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(-0.5);
  st(ctx, o);
  // 瓶身
  const g = ctx.createLinearGradient(-0.06 * s, 0, 0.06 * s, 0);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, '#F2F6FA'); g.addColorStop(1, '#DCE6EE');
  ctx.fillStyle = g;
  rr(ctx, -0.06 * s, -0.06 * s, 0.12 * s, 0.26 * s, 0.05 * s); fs(ctx);
  // 瓶内牛奶
  ctx.fillStyle = '#FFF4D6';
  rr(ctx, -0.048 * s, 0.02 * s, 0.096 * s, 0.17 * s, 0.04 * s); ctx.fill();
  // 瓶盖 + 奶嘴
  ctx.fillStyle = '#FF8FAF';
  rr(ctx, -0.055 * s, -0.11 * s, 0.11 * s, 0.06 * s, 0.025 * s); fs(ctx);
  ctx.fillStyle = '#F26B93';
  ell(ctx, 0, -0.13 * s, 0.028 * s, 0.02 * s); fs(ctx);
  // 玻璃高光
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  rr(ctx, -0.042 * s, -0.03 * s, 0.018 * s, 0.12 * s, 0.01 * s); ctx.fill();
  ctx.restore(); st(ctx, o);
}

// 背后大锅 + 三缕热气（面师傅）
function bigPot(ctx, s, o) {
  ctx.save();
  ctx.translate(0.36 * s, 0.30 * s); ctx.rotate(0.1);
  st(ctx, o);
  // 锅身（深灰渐变）
  const g = ctx.createLinearGradient(0, -0.2 * s, 0, 0.2 * s);
  g.addColorStop(0, '#8C97A6'); g.addColorStop(1, '#59636F');
  ctx.fillStyle = g;
  ell(ctx, 0, 0.02 * s, 0.27 * s, 0.19 * s); fs(ctx);
  // 锅沿
  ctx.fillStyle = '#A8B2C0';
  rr(ctx, -0.31 * s, -0.11 * s, 0.62 * s, 0.09 * s, 0.045 * s); fs(ctx);
  // 锅耳
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = o.lw * 0.9;
  ctx.beginPath(); ctx.arc(-0.32 * s, -0.06 * s, 0.05 * s, Math.PI * 0.4, Math.PI * 1.6); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.32 * s, -0.06 * s, 0.05 * s, -Math.PI * 0.6, Math.PI * 0.6); ctx.stroke();
  // 三缕热气（白色半透明 S 形）
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = o.lw * 0.8; ctx.lineCap = 'round';
  for (const dx of [-0.13, 0, 0.13]) {
    ctx.beginPath();
    ctx.moveTo(dx * s, -0.18 * s);
    ctx.quadraticCurveTo((dx + 0.07) * s, -0.30 * s, dx * s, -0.42 * s);
    ctx.stroke();
  }
  ctx.restore(); st(ctx, o);
}

// 脚下火焰（飞天侠：外焰渐变 + 白色内焰芯）
function flameJet(ctx, s, x, y, sc = 1) {
  const g = ctx.createRadialGradient(x, y, s * 0.01, x, y, s * 0.17 * sc);
  g.addColorStop(0, 'rgba(255,240,160,.95)');
  g.addColorStop(0.45, 'rgba(255,150,40,.7)');
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ell(ctx, x, y, s * 0.115 * sc, s * 0.16 * sc); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,235,.9)';
  ell(ctx, x, y - s * 0.02 * sc, s * 0.045 * sc, s * 0.075 * sc); ctx.fill();
}

// ============================================================
// 七角色立绘（坐标单位：s = size/2，头心(0,-0.30s) r=0.46s）
// ============================================================

// —— 哈基喵：橘猫耳 + 条纹 + 白围兜 + 头顶漂浮蜂蜜罐 ——
function avHajimiao(ctx, s, o) {
  st(ctx, o);
  // 卷尾（身后，带环纹）
  ctx.save();
  ctx.translate(-0.32 * s, 0.30 * s); ctx.rotate(-0.5);
  ctx.fillStyle = '#F59B37';
  ell(ctx, 0, 0, s * 0.14, s * 0.20, 0.6); fs(ctx);
  ctx.strokeStyle = 'rgba(200,120,20,.6)'; ctx.lineWidth = o.lw * 0.8;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.09, -0.7, 1.1); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0.07 * s, s * 0.07, -0.9, 0.9); ctx.stroke();
  ctx.restore(); st(ctx, o);

  // 猫耳（外橘内粉）
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#F59B37';
    ctx.beginPath();
    ctx.moveTo(d * 0.38 * s, -0.44 * s);
    ctx.lineTo(d * 0.52 * s, -0.86 * s);
    ctx.lineTo(d * 0.10 * s, -0.66 * s);
    ctx.closePath(); fs(ctx);
  }
  // 头（径向渐变体积感）
  ctx.fillStyle = headGrad(ctx, s, '#FFD48F', '#F59B37');
  circ(ctx, 0, -0.30 * s, 0.46 * s); fs(ctx);
  // 内耳（贴在耳尖处，避免被头覆盖）
  ctx.fillStyle = '#FFC0A8';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 0.33 * s, -0.52 * s);
    ctx.lineTo(d * 0.45 * s, -0.78 * s);
    ctx.lineTo(d * 0.20 * s, -0.63 * s);
    ctx.closePath(); ctx.fill();
  }
  // 头顶虎斑条纹
  ctx.strokeStyle = 'rgba(200,120,20,.6)'; ctx.lineWidth = o.lw * 0.9; ctx.lineCap = 'round';
  for (const dx of [-0.16, 0, 0.16]) {
    ctx.beginPath(); ctx.arc(dx * s, -0.62 * s, s * 0.10, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
  }
  st(ctx, o);
  // 口鼻浅色区
  ctx.fillStyle = 'rgba(255,244,222,.9)';
  ell(ctx, 0, -0.10 * s, s * 0.24, s * 0.17); ctx.fill();
  // 眉毛 + 玻璃大眼（琥珀色虹膜）
  brows(ctx, s, o, { y: -0.52 });
  eyes(ctx, s, o, { irisTop: '#7A4A16', iris: '#A8681E', irisBot: '#E8A850' });
  // 三角鼻 + w 形猫嘴
  ctx.fillStyle = '#D96A4A';
  ctx.beginPath();
  ctx.moveTo(-0.045 * s, -0.17 * s); ctx.lineTo(0.045 * s, -0.17 * s);
  ctx.lineTo(0, -0.11 * s); ctx.closePath(); ctx.fill();
  st(ctx, o); ctx.lineWidth = o.lw * 0.9;
  ctx.beginPath(); ctx.arc(-0.06 * s, -0.055 * s, s * 0.05, 0.15, Math.PI - 0.15); ctx.stroke();
  ctx.beginPath(); ctx.arc(0.06 * s, -0.055 * s, s * 0.05, 0.15, Math.PI - 0.15); ctx.stroke();
  // 胡须（左右各两根）
  ctx.strokeStyle = 'rgba(120,75,20,.55)'; ctx.lineWidth = o.lw * 0.55;
  for (const d of [-1, 1]) for (const dy of [0, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(d * 0.34 * s, (-0.13 + dy) * s);
    ctx.lineTo(d * 0.54 * s, (-0.16 + dy) * s);
    ctx.stroke();
  }
  // 腮红
  blush(ctx, -0.31 * s, -0.14 * s, s * 0.09, s * 0.06);
  blush(ctx, 0.31 * s, -0.14 * s, s * 0.09, s * 0.06);

  // 身体（橘色渐变）
  ctx.fillStyle = bodyGrad(ctx, s, '#FFC873', '#F08A28');
  rr(ctx, -0.24 * s, 0.02 * s, 0.48 * s, 0.68 * s, 0.20 * s); fs(ctx);
  // 白色围兜 + 颈绳
  st(ctx, o);
  ctx.strokeStyle = '#E8B060'; ctx.lineWidth = o.lw * 0.7;
  ctx.beginPath();
  ctx.moveTo(-0.14 * s, 0.05 * s); ctx.lineTo(-0.17 * s, 0.10 * s);
  ctx.moveTo(0.14 * s, 0.05 * s); ctx.lineTo(0.17 * s, 0.10 * s);
  ctx.stroke();
  st(ctx, o);
  ctx.fillStyle = '#FFF8EA';
  ctx.beginPath();
  ctx.moveTo(-0.17 * s, 0.08 * s);
  ctx.quadraticCurveTo(0, 0.17 * s, 0.17 * s, 0.08 * s);
  ctx.lineTo(0.10 * s, 0.52 * s);
  ctx.quadraticCurveTo(0, 0.58 * s, -0.10 * s, 0.52 * s);
  ctx.closePath(); fs(ctx);
  // 围兜上的蜂蜜滴图案
  ctx.fillStyle = '#FFC63E';
  ell(ctx, 0, 0.32 * s, s * 0.05, s * 0.065); ctx.fill();

  // 小手小脚
  arms(ctx, s, o, { sx: 0.22, sy: 0.16, len: 0.24, w: 0.09, color: '#F59B37', skin: '#FFD9A8' });
  feet(ctx, s, o, '#F08A28', 0.14, 0.76);

  // 头顶漂浮蜂蜜罐（带高光 + 蜜滴）
  honeyJar(ctx, s, o, 0.34 * s, -1.04 * s);
}

// —— 大狗旺：柴犬耳 + 超大张嘴(口腔/舌/双虎牙) + 脖子喇叭 ——
function avDasangwang(ctx, s, o) {
  st(ctx, o);
  // 柴犬卷尾（尾尖奶油色）
  ctx.save();
  ctx.translate(-0.32 * s, 0.28 * s); ctx.rotate(0.4);
  ctx.fillStyle = '#F5B93B';
  ell(ctx, 0, 0, s * 0.15, s * 0.19, 0.5); fs(ctx);
  ctx.fillStyle = '#FFF3DC';
  ell(ctx, 0, -0.06 * s, s * 0.07, s * 0.08, 0.5); ctx.fill();
  ctx.restore(); st(ctx, o);

  // 柴犬耳（圆角三角，外橘内奶油）
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#E8A83C';
    ctx.beginPath();
    ctx.moveTo(d * 0.34 * s, -0.42 * s);
    ctx.quadraticCurveTo(d * 0.58 * s, -0.86 * s, d * 0.18 * s, -0.72 * s);
    ctx.quadraticCurveTo(d * 0.12 * s, -0.54 * s, d * 0.34 * s, -0.42 * s);
    ctx.closePath(); fs(ctx);
    ctx.fillStyle = '#FFF3DC';
    ctx.beginPath();
    ctx.moveTo(d * 0.32 * s, -0.50 * s);
    ctx.quadraticCurveTo(d * 0.45 * s, -0.72 * s, d * 0.25 * s, -0.63 * s);
    ctx.closePath(); ctx.fill();
  }
  // 头
  ctx.fillStyle = headGrad(ctx, s, '#FFE7A8', '#F5B93B');
  circ(ctx, 0, -0.30 * s, 0.46 * s); fs(ctx);
  // 眉心奶油毛纹
  ctx.fillStyle = 'rgba(255,246,222,.9)';
  ell(ctx, 0, -0.52 * s, s * 0.09, s * 0.07); ctx.fill();
  // 活力眉毛（外挑）
  st(ctx, o); ctx.lineWidth = o.lw * 0.95;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 0.08 * s, -0.53 * s);
    ctx.quadraticCurveTo(d * 0.17 * s, -0.57 * s, d * 0.26 * s, -0.52 * s);
    ctx.stroke();
  }
  // 玻璃大眼
  eyes(ctx, s, o, { irisTop: '#5A3410', iris: '#8A5220', irisBot: '#D89450', ry: 0.10 });
  // 口鼻奶油区
  st(ctx, o);
  ctx.fillStyle = '#FFF6E2';
  ell(ctx, 0, 0.0, s * 0.31, s * 0.26); fs(ctx);
  // 鼻头
  ctx.fillStyle = '#4A3020';
  ell(ctx, 0, -0.13 * s, s * 0.055, s * 0.04); fs(ctx);
  // 超大张嘴（口腔径向渐变）
  const mg = ctx.createRadialGradient(0, 0.10 * s, s * 0.05, 0, 0.20 * s, s * 0.32);
  mg.addColorStop(0, '#C0503C'); mg.addColorStop(1, '#7E2A20');
  ctx.fillStyle = mg;
  ell(ctx, 0, 0.20 * s, s * 0.26, s * 0.19); fs(ctx);
  // 舌头（渐变粉，带中线）
  const tg = ctx.createLinearGradient(0, 0.22 * s, 0, 0.38 * s);
  tg.addColorStop(0, '#FFA8B8'); tg.addColorStop(1, '#F0708A');
  ctx.fillStyle = tg;
  ell(ctx, 0, 0.29 * s, s * 0.14, s * 0.09); fs(ctx);
  ctx.strokeStyle = 'rgba(200,60,90,.5)'; ctx.lineWidth = o.lw * 0.5;
  ctx.beginPath(); ctx.moveTo(0, 0.24 * s); ctx.lineTo(0, 0.35 * s); ctx.stroke();
  st(ctx, o);
  // 两颗小虎牙
  ctx.fillStyle = '#FFFFFF';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 0.17 * s, 0.075 * s);
    ctx.lineTo(d * 0.085 * s, 0.075 * s);
    ctx.lineTo(d * 0.125 * s, 0.165 * s);
    ctx.closePath(); ctx.fill();
  }
  // 腮红
  blush(ctx, -0.35 * s, -0.16 * s, s * 0.085, s * 0.055);
  blush(ctx, 0.35 * s, -0.16 * s, s * 0.085, s * 0.055);

  // 身体 + 胸前奶油毛
  ctx.fillStyle = bodyGrad(ctx, s, '#FFD37A', '#F0A828');
  rr(ctx, -0.24 * s, 0.02 * s, 0.48 * s, 0.68 * s, 0.20 * s); fs(ctx);
  ctx.fillStyle = '#FFF6E2';
  ell(ctx, 0, 0.30 * s, s * 0.15, s * 0.20); ctx.fill();

  // 脖子小喇叭
  megaphone(ctx, s, o);
  // 小手小脚
  arms(ctx, s, o, { sx: 0.22, sy: 0.18, len: 0.24, w: 0.09, color: '#F5B93B', skin: '#FFE7A8' });
  feet(ctx, s, o, '#E8A83C', 0.14, 0.76);
}

// —— 飞天侠：红斗篷(星星纹+褶皱) + 自信斜眉 + 脚下双火焰 ——
function avFeitianxia(ctx, s, o) {
  st(ctx, o);
  // 红斗篷（身后，happy/attack 时更张开）
  const spread = (o.pose === 'happy' || o.pose === 'attack') ? 0.70 : 0.58;
  const cg = ctx.createLinearGradient(0, -0.1 * s, 0, 0.62 * s);
  cg.addColorStop(0, '#F06060'); cg.addColorStop(1, '#C03030');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-0.30 * s, -0.08 * s);
  ctx.quadraticCurveTo(-spread * s, 0.30 * s, -spread * 0.85 * s, 0.62 * s);
  ctx.quadraticCurveTo(0, 0.46 * s, spread * 0.85 * s, 0.62 * s);
  ctx.quadraticCurveTo(spread * s, 0.30 * s, 0.30 * s, -0.08 * s);
  ctx.closePath(); fs(ctx);
  // 褶皱线（领口向扇形下摆发散）
  ctx.strokeStyle = 'rgba(140,20,20,.5)'; ctx.lineWidth = o.lw * 0.6;
  for (const k of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(k * 0.18 * s, -0.02 * s);
    ctx.quadraticCurveTo(k * 0.26 * s, 0.26 * s, k * 0.34 * s, 0.56 * s);
    ctx.stroke();
  }
  // 斗篷星星纹
  ctx.fillStyle = '#FFE066';
  starPath(ctx, -0.26 * s, 0.32 * s, s * 0.06); ctx.fill();
  starPath(ctx, 0.28 * s, 0.40 * s, s * 0.05); ctx.fill();
  starPath(ctx, 0, 0.52 * s, s * 0.045); ctx.fill();
  st(ctx, o);

  // 身体（白色小制服 + 金腰带 + 星星徽章）
  ctx.fillStyle = bodyGrad(ctx, s, '#FFFFFF', '#E2D8BE');
  rr(ctx, -0.24 * s, 0.02 * s, 0.48 * s, 0.68 * s, 0.20 * s); fs(ctx);
  ctx.fillStyle = '#F5B93B';
  rr(ctx, -0.22 * s, 0.40 * s, 0.44 * s, 0.09 * s, 0.04 * s); fs(ctx);
  ctx.fillStyle = '#FFDF70';
  starPath(ctx, 0, 0.24 * s, s * 0.07); fs(ctx);
  // 肩章
  ctx.fillStyle = '#D83838';
  rr(ctx, -0.26 * s, 0.04 * s, 0.10 * s, 0.07 * s, 0.03 * s); fs(ctx);
  rr(ctx, 0.16 * s, 0.04 * s, 0.10 * s, 0.07 * s, 0.03 * s); fs(ctx);

  // 小手小脚（红靴子）
  arms(ctx, s, o, { sx: 0.22, sy: 0.16, len: 0.24, w: 0.09, color: '#FFFDF4', skin: '#FFE3C8' });
  feet(ctx, s, o, '#D83838', 0.14, 0.76);

  // 头（肤色）+ 英气头发
  ctx.fillStyle = headGrad(ctx, s, '#FFECD8', '#F2C49A');
  circ(ctx, 0, -0.30 * s, 0.44 * s); fs(ctx);
  // 头发（顶部弧 + 锯齿刘海 + 高光）
  ctx.fillStyle = '#5A4632';
  ctx.beginPath();
  ctx.arc(0, -0.34 * s, 0.44 * s, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineTo(0.30 * s, -0.56 * s);
  ctx.lineTo(0.17 * s, -0.47 * s);
  ctx.lineTo(0.05 * s, -0.58 * s);
  ctx.lineTo(-0.09 * s, -0.47 * s);
  ctx.lineTo(-0.21 * s, -0.57 * s);
  ctx.lineTo(-0.33 * s, -0.46 * s);
  ctx.closePath(); fs(ctx);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = o.lw * 0.6;
  ctx.beginPath(); ctx.arc(0, -0.36 * s, 0.34 * s, Math.PI * 1.25, Math.PI * 1.55); ctx.stroke();
  st(ctx, o);
  // 自信斜眉（外高内低的挑眉）
  ctx.lineWidth = o.lw * 1.1;
  ctx.beginPath();
  ctx.moveTo(-0.08 * s, -0.50 * s); ctx.lineTo(-0.26 * s, -0.44 * s);
  ctx.moveTo(0.08 * s, -0.50 * s); ctx.lineTo(0.26 * s, -0.44 * s);
  ctx.stroke();
  // 玻璃大眼（棕色）
  eyes(ctx, s, o, { rx: 0.075, ry: 0.10, irisTop: '#4A2E10', iris: '#7A4E1E', irisBot: '#C88840' });
  // 嘴角上扬的笑
  st(ctx, o); ctx.lineWidth = o.lw * 0.9;
  ctx.beginPath();
  ctx.moveTo(-0.07 * s, -0.10 * s);
  ctx.quadraticCurveTo(0.02 * s, -0.04 * s, 0.11 * s, -0.12 * s);
  ctx.stroke();
  // 腮红
  blush(ctx, -0.28 * s, -0.14 * s, s * 0.07, s * 0.05, 0.38);
  blush(ctx, 0.28 * s, -0.14 * s, s * 0.07, s * 0.05, 0.38);

  // 脚下双火焰
  flameJet(ctx, s, -0.14 * s, 0.90 * s);
  flameJet(ctx, s, 0.14 * s, 0.90 * s);
}

// —— 转转君：转盘头(四色扇叶+高光) + 机器人身体(按钮/彩旗/天线) ——
function avZhuanzhuanjun(ctx, s, o) {
  st(ctx, o);
  // 机器人身体（金属横向渐变）
  const bg2 = ctx.createLinearGradient(-0.26 * s, 0, 0.26 * s, 0);
  bg2.addColorStop(0, '#DDE7F2'); bg2.addColorStop(0.5, '#BCCBDD'); bg2.addColorStop(1, '#93A7BE');
  ctx.fillStyle = bg2;
  rr(ctx, -0.26 * s, 0.02 * s, 0.52 * s, 0.66 * s, 0.18 * s); fs(ctx);
  // 胸口红色按钮（带高光）
  ctx.fillStyle = '#FF5A5A';
  circ(ctx, 0, 0.50 * s, s * 0.07); fs(ctx);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  circ(ctx, -0.022 * s, 0.478 * s, s * 0.022); ctx.fill();
  // 胸前彩旗（绳 + 四色三角旗）
  ctx.strokeStyle = '#8A6A3C'; ctx.lineWidth = o.lw * 0.7;
  ctx.beginPath();
  ctx.moveTo(-0.22 * s, 0.13 * s);
  ctx.quadraticCurveTo(0, 0.20 * s, 0.22 * s, 0.13 * s);
  ctx.stroke();
  st(ctx, o);
  const flagCols = ['#FF6B6B', '#FFD93D', '#6BCB77', '#5BA8FF'];
  for (let i = 0; i < 4; i++) {
    const fx = -0.155 * s + i * 0.104 * s;
    const fy = 0.145 * s + Math.sin((i + 0.5) / 4 * Math.PI) * 0.045 * s;
    ctx.fillStyle = flagCols[i];
    ctx.beginPath();
    ctx.moveTo(fx - 0.045 * s, fy);
    ctx.lineTo(fx + 0.045 * s, fy);
    ctx.lineTo(fx, fy + 0.10 * s);
    ctx.closePath(); fs(ctx);
  }
  // 侧边铆钉
  ctx.fillStyle = '#8CA0B8';
  for (const [rx, ry2] of [[-0.20, 0.08], [0.20, 0.08], [-0.20, 0.60], [0.20, 0.60]]) {
    circ(ctx, rx * s, ry2 * s, s * 0.025); ctx.fill();
  }
  // 机械臂 + 圆手
  arms(ctx, s, o, { sx: 0.24, sy: 0.16, len: 0.24, w: 0.09, color: '#9FB2C8', skin: '#C8D4E2' });
  // 履带小脚
  st(ctx, o);
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#7A8CA0';
    rr(ctx, d * 0.14 * s - 0.09 * s, 0.70 * s, 0.18 * s, 0.09 * s, 0.045 * s); fs(ctx);
  }
  // 天线（顶球 + 光晕）
  st(ctx, o); ctx.lineWidth = o.lw;
  ctx.beginPath(); ctx.moveTo(0, -0.66 * s); ctx.lineTo(0, -0.84 * s); ctx.stroke();
  ctx.fillStyle = 'rgba(255,90,90,.3)';
  circ(ctx, 0, -0.88 * s, s * 0.095); ctx.fill();
  ctx.fillStyle = '#FF5A5A';
  circ(ctx, 0, -0.88 * s, s * 0.055); fs(ctx);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  circ(ctx, -0.018 * s, -0.898 * s, s * 0.018); ctx.fill();

  // 转盘头：四色扇叶 + 每叶高光 + 外圈 + 铆钉
  const cy = -0.30 * s, R = 0.46 * s, rot = Math.PI / 8;
  const segCols = ['#FF6B6B', '#FFD93D', '#6BCB77', '#5BA8FF'];
  for (let i = 0; i < 4; i++) {
    const a0 = rot + i * Math.PI / 2, a1 = rot + (i + 1) * Math.PI / 2;
    ctx.fillStyle = segCols[i];
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.arc(0, cy, R, a0 + 0.015, a1 - 0.015); ctx.closePath(); ctx.fill();
    // 扇叶高光（外缘浅色弧带）
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.arc(0, cy, R, a0 + 0.10, a0 + 0.42); ctx.closePath(); ctx.fill();
  }
  st(ctx, o);
  circ(ctx, 0, cy, R); ctx.stroke();
  // 边缘铆钉（45° 方位）
  ctx.fillStyle = '#FFFDF4';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    circ(ctx, Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88, s * 0.03); ctx.fill();
  }
  // 白色轴心脸 + 小玻璃眼 + 微笑 + 腮红
  st(ctx, o);
  ctx.fillStyle = '#FFFDF4';
  circ(ctx, 0, cy, s * 0.17); fs(ctx);
  eyes(ctx, s, o, { ex: 0.06, ey: -0.325, rx: 0.038, ry: 0.05, irisTop: '#3A5A8A', iris: '#5B84C0', irisBot: '#9CC0EE' });
  st(ctx, o); ctx.lineWidth = o.lw * 0.8;
  ctx.beginPath(); ctx.arc(0, -0.26 * s, s * 0.045, 0.25, Math.PI - 0.25); ctx.stroke();
  blush(ctx, -0.115 * s, -0.245 * s, s * 0.035, s * 0.025, 0.4);
  blush(ctx, 0.115 * s, -0.245 * s, s * 0.035, s * 0.025, 0.4);
}

// —— 自封之王：歪纸王冠(褶皱线) + 黑背心 + 玩具剑 + 得逞表情 ——
function avZifengzhiwang(ctx, s, o) {
  st(ctx, o);
  // 身体（奶油肤色）
  ctx.fillStyle = bodyGrad(ctx, s, '#FFEDD6', '#F2C8A0');
  rr(ctx, -0.24 * s, 0.02 * s, 0.48 * s, 0.68 * s, 0.20 * s); fs(ctx);
  // 黑背心（左右两片，中间开襟）
  ctx.fillStyle = '#3A3A46';
  rr(ctx, -0.24 * s, 0.03 * s, 0.17 * s, 0.61 * s, 0.07 * s); fs(ctx);
  rr(ctx, 0.07 * s, 0.03 * s, 0.17 * s, 0.61 * s, 0.07 * s); fs(ctx);
  // 背心金扣
  ctx.fillStyle = '#F5B93B';
  circ(ctx, -0.155 * s, 0.20 * s, s * 0.022); ctx.fill();
  circ(ctx, -0.155 * s, 0.32 * s, s * 0.022); ctx.fill();
  circ(ctx, 0.155 * s, 0.20 * s, s * 0.022); ctx.fill();
  circ(ctx, 0.155 * s, 0.32 * s, s * 0.022); ctx.fill();
  // 金色腰带扣
  st(ctx, o);
  ctx.fillStyle = '#F5B93B';
  rr(ctx, -0.05 * s, 0.42 * s, 0.10 * s, 0.07 * s, 0.02 * s); fs(ctx);

  // 小手小脚
  const hands = arms(ctx, s, o, { sx: 0.22, sy: 0.16, len: 0.24, w: 0.09, color: '#FFEDD6', skin: '#FFE3C8' });
  feet(ctx, s, o, '#8A5A2E', 0.14, 0.76);
  // 玩具剑（握在右手）
  toySword(ctx, s, o, hands[1].x, hands[1].y);

  // 头
  ctx.fillStyle = headGrad(ctx, s, '#FFEDD6', '#F2C49A');
  circ(ctx, 0, -0.30 * s, 0.44 * s); fs(ctx);
  // 歪斜纸王冠（黄色 + 褶皱线 + 胶带补丁）
  ctx.save();
  ctx.translate(0.05 * s, -0.66 * s); ctx.rotate(0.16);
  st(ctx, o);
  ctx.fillStyle = '#FFD93D';
  ctx.beginPath();
  ctx.moveTo(-0.21 * s, 0.10 * s);
  ctx.lineTo(-0.21 * s, -0.05 * s);
  ctx.lineTo(-0.105 * s, 0.02 * s);
  ctx.lineTo(0, -0.15 * s);
  ctx.lineTo(0.105 * s, 0.02 * s);
  ctx.lineTo(0.21 * s, -0.05 * s);
  ctx.lineTo(0.21 * s, 0.10 * s);
  ctx.closePath(); fs(ctx);
  // 褶皱线（每个折角向下）
  ctx.strokeStyle = '#DFA70E'; ctx.lineWidth = o.lw * 0.55;
  ctx.beginPath();
  ctx.moveTo(-0.105 * s, 0.02 * s); ctx.lineTo(-0.105 * s, 0.10 * s);
  ctx.moveTo(0, -0.14 * s); ctx.lineTo(0, 0.06 * s);
  ctx.moveTo(0.105 * s, 0.02 * s); ctx.lineTo(0.105 * s, 0.10 * s);
  ctx.stroke();
  // 歪掉的胶带补丁
  ctx.save();
  ctx.translate(0.13 * s, 0.05 * s); ctx.rotate(-0.4);
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  rr(ctx, -0.05 * s, -0.02 * s, 0.10 * s, 0.045 * s, 0.01 * s); ctx.fill();
  ctx.restore();
  ctx.restore(); st(ctx, o);

  // 得逞表情：一眉高挑一眉压低
  st(ctx, o); ctx.lineWidth = o.lw;
  ctx.beginPath();
  ctx.moveTo(-0.26 * s, -0.50 * s); ctx.quadraticCurveTo(-0.17 * s, -0.56 * s, -0.08 * s, -0.51 * s);
  ctx.moveTo(0.08 * s, -0.46 * s); ctx.quadraticCurveTo(0.17 * s, -0.45 * s, 0.26 * s, -0.49 * s);
  ctx.stroke();
  // 玻璃大眼（上睑斜压，坏笑感）
  eyes(ctx, s, o, { rx: 0.075, ry: 0.10, irisTop: '#3A2A12', iris: '#6B4A1E', irisBot: '#B8843C' });
  st(ctx, o); ctx.lineWidth = o.lw * 0.9;
  ctx.beginPath();
  ctx.moveTo(-0.25 * s, -0.36 * s); ctx.lineTo(-0.10 * s, -0.335 * s);
  ctx.moveTo(0.10 * s, -0.35 * s); ctx.lineTo(0.25 * s, -0.38 * s);
  ctx.stroke();
  // 得逞撇嘴（一侧上扬）+ 小虎牙
  ctx.beginPath();
  ctx.moveTo(-0.09 * s, -0.075 * s);
  ctx.quadraticCurveTo(0.03 * s, -0.015 * s, 0.12 * s, -0.10 * s);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0.075 * s, -0.062 * s); ctx.lineTo(0.115 * s, -0.07 * s); ctx.lineTo(0.098 * s, -0.028 * s);
  ctx.closePath(); ctx.fill();
  // 腮红
  blush(ctx, -0.29 * s, -0.15 * s, s * 0.065, s * 0.045, 0.35);
  blush(ctx, 0.29 * s, -0.15 * s, s * 0.065, s * 0.045, 0.35);
}

// —— 小牛：粉斑奶牛 + 蝴蝶结 + 水汪汪泪光大眼 + 奶瓶 ——
function avXiaoniu(ctx, s, o) {
  st(ctx, o);
  // 横伸牛耳（外白内粉）
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#FFFDF6';
    ell(ctx, d * 0.45 * s, -0.46 * s, s * 0.14, s * 0.085, d * 0.45); fs(ctx);
    ctx.fillStyle = '#FFC7D8';
    ell(ctx, d * 0.46 * s, -0.465 * s, s * 0.08, s * 0.045, d * 0.45); ctx.fill();
  }
  // 小牛角（奶油色弯角）
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#F5DEB8';
    ctx.beginPath();
    ctx.moveTo(d * 0.15 * s, -0.68 * s);
    ctx.quadraticCurveTo(d * 0.36 * s, -0.72 * s, d * 0.27 * s, -0.90 * s);
    ctx.quadraticCurveTo(d * 0.20 * s, -0.76 * s, d * 0.15 * s, -0.68 * s);
    ctx.closePath(); fs(ctx);
  }
  // 头（奶白渐变）
  ctx.fillStyle = headGrad(ctx, s, '#FFFFFF', '#EFE2D2');
  circ(ctx, 0, -0.30 * s, 0.46 * s); fs(ctx);
  // 粉色斑块（头上两块）
  ctx.fillStyle = '#FFC7D8';
  ell(ctx, -0.30 * s, -0.50 * s, s * 0.13, s * 0.09, 0.5); ctx.fill();
  ell(ctx, 0.31 * s, -0.42 * s, s * 0.10, s * 0.075, -0.4); ctx.fill();
  // 粉蝴蝶结（左耳旁）
  bowKnot(ctx, s, o, -0.34 * s, -0.60 * s, 1.0);
  // 温柔小眉
  brows(ctx, s, o, { y: -0.50, tilt: 0.04 });
  // 水汪汪泪光大眼（更大更亮 + 蓝虹膜 + 眼底泪光）
  eyes(ctx, s, o, {
    rx: 0.10, ry: 0.135, ex: 0.165, ey: -0.31,
    irisTop: '#2E5E96', iris: '#5B9BD5', irisBot: '#B8E0F8', tear: true,
  });
  // 挂在脸颊的大泪滴（含高光）
  ctx.fillStyle = 'rgba(150,215,255,.92)';
  ctx.beginPath();
  ctx.moveTo(-0.27 * s, -0.18 * s);
  ctx.quadraticCurveTo(-0.315 * s, -0.08 * s, -0.27 * s, -0.03 * s);
  ctx.quadraticCurveTo(-0.225 * s, -0.08 * s, -0.27 * s, -0.18 * s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ell(ctx, -0.283 * s, -0.09 * s, s * 0.012, s * 0.022); ctx.fill();
  st(ctx, o);
  // 粉色口鼻 + 鼻孔 + 小嘴
  ctx.fillStyle = '#FFD9E4';
  ell(ctx, 0, 0.07 * s, s * 0.22, s * 0.15); fs(ctx);
  ctx.fillStyle = '#E88AA8';
  ell(ctx, -0.08 * s, 0.045 * s, s * 0.026, s * 0.036); ctx.fill();
  ell(ctx, 0.08 * s, 0.045 * s, s * 0.026, s * 0.036); ctx.fill();
  st(ctx, o); ctx.lineWidth = o.lw * 0.85;
  ctx.beginPath(); ctx.arc(0, 0.115 * s, s * 0.045, 0.25, Math.PI - 0.25); ctx.stroke();
  // 腮红
  blush(ctx, -0.33 * s, 0.02 * s, s * 0.085, s * 0.055, 0.5);
  blush(ctx, 0.33 * s, 0.02 * s, s * 0.085, s * 0.055, 0.5);

  // 身体（奶白 + 粉斑）
  ctx.fillStyle = bodyGrad(ctx, s, '#FFFFFF', '#EFE2D2');
  rr(ctx, -0.24 * s, 0.02 * s, 0.48 * s, 0.68 * s, 0.20 * s); fs(ctx);
  ctx.fillStyle = '#FFC7D8';
  ell(ctx, -0.12 * s, 0.30 * s, s * 0.09, s * 0.065, 0.4); ctx.fill();
  ell(ctx, 0.13 * s, 0.48 * s, s * 0.075, s * 0.055, -0.5); ctx.fill();
  // 小铃铛项圈
  st(ctx, o);
  ctx.fillStyle = '#FF8FAF';
  rr(ctx, -0.20 * s, 0.06 * s, 0.40 * s, 0.06 * s, 0.03 * s); fs(ctx);
  ctx.fillStyle = '#F5B93B';
  circ(ctx, 0, 0.16 * s, s * 0.035); fs(ctx);

  // 小手（抱奶瓶）+ 小脚
  const hands = arms(ctx, s, o, { sx: 0.22, sy: 0.18, len: 0.22, w: 0.09, color: '#FFFDF6', skin: '#FFFDF6' });
  feet(ctx, s, o, '#FFC7D8', 0.14, 0.76);
  milkBottle(ctx, s, o, hands[1].x, hands[1].y);
}

// —— 面师傅：厨师帽(蓬松三球) + 围裙「忘情」字 + 背后大锅冒热气 ——
function avMianshifu(ctx, s, o) {
  st(ctx, o);
  // 背后大锅 + 热气（先画，被身体遮住一半）
  bigPot(ctx, s, o);

  // 身体（白色厨师服）
  ctx.fillStyle = bodyGrad(ctx, s, '#FFFDF6', '#E9DFCB');
  rr(ctx, -0.24 * s, 0.02 * s, 0.48 * s, 0.68 * s, 0.20 * s); fs(ctx);
  // 双排扣
  ctx.fillStyle = '#C8A850';
  for (const dy of [0.14, 0.24]) for (const d of [-1, 1]) {
    circ(ctx, d * 0.10 * s, dy * s, s * 0.018); ctx.fill();
  }
  st(ctx, o);
  // 围裙颈带
  ctx.strokeStyle = '#E0CFA8'; ctx.lineWidth = o.lw * 0.8;
  ctx.beginPath();
  ctx.moveTo(-0.10 * s, 0.04 * s); ctx.lineTo(-0.13 * s, 0.16 * s);
  ctx.moveTo(0.10 * s, 0.04 * s); ctx.lineTo(0.13 * s, 0.16 * s);
  ctx.stroke();
  st(ctx, o);
  // 围裙（米色）+ 口袋
  ctx.fillStyle = '#F5E6C8';
  rr(ctx, -0.17 * s, 0.16 * s, 0.34 * s, 0.36 * s, 0.08 * s); fs(ctx);
  ctx.strokeStyle = '#D8C49A'; ctx.lineWidth = o.lw * 0.7;
  rr(ctx, -0.10 * s, 0.36 * s, 0.20 * s, 0.10 * s, 0.03 * s); ctx.stroke();
  // 「忘情」字
  ctx.fillStyle = '#8A6A3C';
  ctx.font = `bold ${s * 0.11}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('忘情', 0, 0.315 * s);

  // 小手小脚
  arms(ctx, s, o, { sx: 0.22, sy: 0.16, len: 0.24, w: 0.09, color: '#FFFDF4', skin: '#FFE3C8' });
  feet(ctx, s, o, '#8A5A2E', 0.14, 0.76);

  // 头（圆润福相）
  ctx.fillStyle = headGrad(ctx, s, '#FFEDD6', '#F2C49A');
  circ(ctx, 0, -0.28 * s, 0.46 * s); fs(ctx);
  // 厨师帽：蓬松三球 + 帽箍
  st(ctx, o);
  ctx.fillStyle = '#FFFDF6';
  circ(ctx, -0.155 * s, -0.66 * s, s * 0.125); fs(ctx);
  circ(ctx, 0.155 * s, -0.66 * s, s * 0.125); fs(ctx);
  circ(ctx, 0, -0.74 * s, s * 0.155); fs(ctx);
  // 帽箍
  ctx.fillStyle = '#FFFDF6';
  rr(ctx, -0.21 * s, -0.60 * s, 0.42 * s, 0.13 * s, 0.05 * s); fs(ctx);
  // 帽子阴影褶皱
  ctx.strokeStyle = 'rgba(215,205,180,.9)'; ctx.lineWidth = o.lw * 0.6;
  for (const [dx, dy] of [[-0.155, -0.62], [0.155, -0.62], [-0.05, -0.72], [0.06, -0.72]]) {
    ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.05, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  }
  st(ctx, o);
  // 安详眯眼（窄版玻璃眼）
  eyes(ctx, s, o, { rx: 0.078, ry: 0.07, ey: -0.27, keepOpen: false, irisTop: '#4A3214', iris: '#7A5424', irisBot: '#C08C48' });
  // 温和眉
  brows(ctx, s, o, { y: -0.42, tilt: 0.03 });
  // 慈祥微笑
  st(ctx, o); ctx.lineWidth = o.lw * 0.9;
  ctx.beginPath(); ctx.arc(0, -0.08 * s, s * 0.055, 0.25, Math.PI - 0.25); ctx.stroke();
  // 腮红
  blush(ctx, -0.30 * s, -0.12 * s, s * 0.075, s * 0.05, 0.42);
  blush(ctx, 0.30 * s, -0.12 * s, s * 0.075, s * 0.05, 0.42);
}

// 角色 Painter 注册表
const PAINTERS = {
  hajimiao: avHajimiao,
  dasangwang: avDasangwang,
  feitianxia: avFeitianxia,
  zhuanzhuanjun: avZhuanzhuanjun,
  zifengzhiwang: avZifengzhiwang,
  xiaoniu: avXiaoniu,
  mianshifu: avMianshifu,
};

// ============================================================
// 导出 API
// ============================================================

/**
 * 绘制 Q 版角色立绘（签名与 render.js 旧版兼容，另支持 opts）
 * @param {CanvasRenderingContext2D} ctx 画布上下文
 * @param {string} charId 角色 id：hajimiao/dasangwang/feitianxia/zhuanzhuanjun/zifengzhiwang/xiaoniu/mianshifu
 * @param {number} x,y 角色中心锚点（水平居中于 x，脚底阴影在 y+0.84*size/2）
 * @param {number} size 立绘基准尺寸（直径）
 * @param {object} opts {pose:'idle'|'attack'|'happy', blink:0~1}
 */
export function drawAvatar(ctx, charId, x, y, size, opts = {}) {
  if (!ctx) return;
  // AI 立绘优先：素材就绪后直接贴图（PNG 含少量透明留白，放大 0.98 补偿）
  if (artHas(charArtKey(charId))) {
    drawArtCentered(ctx, charArtKey(charId), x, y, size * 0.98);
    return;
  }
  const s = size / 2;
  const o = {
    pose: opts.pose || 'idle',
    blink: opts.blink || 0,
    lw: Math.max(1.1, size * 0.02),   // 深色描边线宽 = size*0.02
  };
  ctx.save();
  ctx.translate(x, y);
  // 脚下椭圆软阴影（不随姿态倾斜）
  softShadow(ctx, s);
  // attack：整体微前倾
  if (o.pose === 'attack') ctx.rotate(0.06);
  // 统一描边状态
  st(ctx, o);
  (PAINTERS[charId] || avHajimiao)(ctx, s, o);
  ctx.restore();
}

/**
 * 循环动画：呼吸缩放 ±2% + 每 3 秒眨眼 + 摇摆 ±1.5°（rAF 驱动）
 * @param {HTMLCanvasElement} canvas 目标画布（尺寸由本函数接管）
 * @returns {Function} stop() —— 停止动画
 */
export function drawAvatarAnim(canvas, charId, size) {
  const ctx = prepCanvas(canvas, size, size);
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  function frame(now) {
    if (stopped) return;
    const t = (now - t0) / 1000;
    // 呼吸：整体缩放 1±0.02
    const breathe = 1 + 0.02 * Math.sin(t * Math.PI * 2 / 2.6);
    // 摇摆：±1.5°
    const sway = (Math.PI / 180) * 1.5 * Math.sin(t * Math.PI * 2 / 3.4);
    // 眨眼：每 3 秒闭合同步（相位 <0.14s 时按正弦闭合）
    let blink = 0;
    const ph = t % 3;
    if (ph < 0.14) blink = Math.sin((ph / 0.14) * Math.PI);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    // 以胸口为轴心缩放/摇摆，脚底基本不动
    ctx.translate(size / 2, size * 0.55);
    ctx.rotate(sway);
    ctx.scale(breathe, breathe);
    drawAvatar(ctx, charId, 0, 0, size * 0.9, { blink });
    ctx.restore();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return function stop() { stopped = true; cancelAnimationFrame(raf); };
}

// 详情页各角色主题色 [亮色, 主色, 深色]
const PORTRAIT_THEMES = {
  hajimiao: ['#FFDFA0', '#F59B37', '#9A5A10'],
  dasangwang: ['#FFEDB0', '#F0A828', '#96660E'],
  feitianxia: ['#FFBFB2', '#E84A4A', '#8C1F1F'],
  zhuanzhuanjun: ['#BCD8FF', '#4E92E8', '#1F4E8C'],
  zifengzhiwang: ['#FFE28A', '#E8A81E', '#7A5A10'],
  xiaoniu: ['#FFC9DC', '#F87BA4', '#B34A6E'],
  mianshifu: ['#FFD9A8', '#F0903C', '#A0561A'],
};

// 简单字符串哈希（星星散布种子）
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 确定性伪随机（mulberry32）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 详情页大立绘：角色站在主题色渐变圆形底座光环中，背景放射线 + 星星点缀
 * @param {HTMLCanvasElement} canvas 目标画布
 * @param {string} charId 角色 id
 * @param {number} w,h 画布 CSS 尺寸
 */
export function drawPortrait(canvas, charId, w, h) {
  const ctx = prepCanvas(canvas, w, h);
  const th = PORTRAIT_THEMES[charId] || PORTRAIT_THEMES.hajimiao;
  const cx = w / 2;
  const charSize = Math.min(w, h) * 0.72;
  const charCy = h * 0.48;

  // 1. 背景竖向渐变（深色底）
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, th[2]);
  bg.addColorStop(0.55, th[1]);
  bg.addColorStop(1, th[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 2. 放射线（从中心发散的交替楔形）
  ctx.save();
  ctx.translate(cx, charCy + charSize * 0.06);
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = a0 + Math.PI / 12;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,0)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, Math.max(w, h), a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. 星星点缀（确定性散布，金白相间）
  const rng = mulberry32(hashStr(charId || 'hajimiao'));
  for (let i = 0; i < 14; i++) {
    const sx = rng() * w, sy = rng() * h * 0.9;
    const sr = 3 + rng() * 7;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,224,102,.9)' : `rgba(255,255,255,${0.35 + rng() * 0.5})`;
    starPath(ctx, sx, sy, sr);
    ctx.fill();
  }

  // 4. 主题色圆形底座光环（角色身后的大光晕）
  const R = charSize * 0.62;
  const halo = ctx.createRadialGradient(cx, charCy, R * 0.2, cx, charCy, R);
  halo.addColorStop(0, 'rgba(255,255,255,.55)');
  halo.addColorStop(0.55, th[0] + 'AA');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  circ(ctx, cx, charCy, R); ctx.fill();
  // 光环描边圈
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = Math.max(1.5, w * 0.006);
  ctx.setLineDash([10, 8]);
  circ(ctx, cx, charCy, R * 0.94); ctx.stroke();
  ctx.setLineDash([]);

  // 5. 脚下站台（渐变椭圆底座）
  const stageY = charCy + charSize * 0.36;
  const sg = ctx.createRadialGradient(cx, stageY, 0, cx, stageY, charSize * 0.42);
  sg.addColorStop(0, 'rgba(255,255,255,.65)');
  sg.addColorStop(0.6, th[0] + '88');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ell(ctx, cx, stageY, charSize * 0.42, charSize * 0.10); ctx.fill();

  // 6. 角色大立绘
  drawAvatar(ctx, charId, cx, charCy, charSize, { pose: 'idle' });
}
