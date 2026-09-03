// ============================================================
// js/ui/map.js —— 世界地图场景（DOM + SVG 实现）
//
// 用法：
//   import { renderWorldMap } from './ui/map.js';
//   renderWorldMap(container, {
//     levels,                 // 全部关卡数组（含 chapter/id/boss 字段）
//     chapters,               // 章节数组（CHAPTERS）
//     chapterUnlocked(ch),    // 章节是否解锁
//     levelStars(id),         // 关卡星数（0~3）
//     unlockedLevels,         // 当前最高解锁关卡 id
//     onSelect(levelId),      // 点击关卡节点
//     onBack,                 // 点击返回
//     currentChapter,         // 当前章节 id
//     setChapter(id),         // 切换章节（内部会自动重渲染）
//   });
//
// 结构：
//   顶栏（返回 + 章节信息条）→ 章节 tab 横滑 → 纵向可滚动地图
//   （SVG 蜿蜒虚线路径 + 关卡圆形节点 + 当前进度节点金色脉冲 + 哈基喵小立绘）
//   每章主题背景：CSS 渐变 + SVG 装饰（草原/峡谷/云端/赌场/废墟/牧场/面馆/星空）
// ============================================================

import { drawAvatar } from './avatars.js';

// —— 每章主题背景（CSS 渐变）——
const THEMES = {
  1: { bg: 'linear-gradient(180deg,#9BD886,#63B35B 55%,#4C9A4C)', img: 'assets/bg_ch1.jpg' },   // 草原绿
  2: { bg: 'linear-gradient(180deg,#D2A473,#A5714A 55%,#84553A)', img: 'assets/bg_ch2.jpg' },   // 峡谷褐
  3: { bg: 'linear-gradient(180deg,#A5D0F7,#7AB2EE 55%,#69A3E4)', img: 'assets/bg_ch3.jpg' },   // 云端蓝
  4: { bg: 'linear-gradient(180deg,#8C3A6E,#66244F 55%,#4E1A3D)', img: 'assets/bg_ch4.jpg' },   // 赌场紫红
  5: { bg: 'linear-gradient(180deg,#A8AEB4,#868C93 55%,#71777E)', img: 'assets/bg_ch5.jpg' },   // 废墟灰
  6: { bg: 'linear-gradient(180deg,#FFCFE2,#F7A9C6 55%,#EE92B6)', img: 'assets/bg_ch6.jpg' },   // 牧场粉
  7: { bg: 'linear-gradient(180deg,#FFB35C,#EE8438 55%,#D06A26)', img: 'assets/bg_ch7.jpg' },   // 面馆暖橙
  8: { bg: 'linear-gradient(180deg,#24356E,#17224C 55%,#0E1533)', img: 'assets/bg_ch8.jpg' },   // 星空深蓝
};

// —— SVG 装饰图元（小尺寸内联 SVG，绝对定位散布在地图上）——
const DECO_SVG = {
  cloud: '<g fill="rgba(255,255,255,.9)" stroke="rgba(200,220,245,.9)" stroke-width="1.5">'
    + '<ellipse cx="20" cy="26" rx="14" ry="9"/><ellipse cx="34" cy="18" rx="13" ry="11"/><ellipse cx="47" cy="26" rx="11" ry="8"/></g>',
  grass: '<path d="M6 28 Q8 12 10 28 M12 28 Q15 6 18 28 M20 28 Q23 12 26 28" fill="none" stroke="rgba(30,90,30,.55)" stroke-width="3" stroke-linecap="round"/>',
  mountain: '<path d="M4 42 L22 8 L40 42 Z" fill="rgba(120,75,45,.75)" stroke="rgba(90,55,30,.8)" stroke-width="2"/>'
    + '<path d="M17 17 L22 8 L27 17 Z" fill="rgba(240,225,205,.8)"/>',
  diamond: '<rect x="15" y="15" width="18" height="18" transform="rotate(45 24 24)" fill="rgba(240,110,160,.7)" stroke="rgba(255,215,120,.9)" stroke-width="2"/>'
    + '<rect x="20.5" y="20.5" width="7" height="7" transform="rotate(45 24 24)" fill="rgba(255,215,120,.9)"/>',
  pillar: '<rect x="13" y="10" width="13" height="36" fill="rgba(200,205,212,.8)" stroke="rgba(120,125,132,.9)" stroke-width="2"/>'
    + '<rect x="10" y="5" width="19" height="6" fill="rgba(210,215,222,.9)" stroke="rgba(120,125,132,.9)" stroke-width="2"/>'
    + '<path d="M19 14 L19 42" stroke="rgba(120,125,132,.7)" stroke-width="1.5" stroke-dasharray="3 3"/>',
  fence: '<g fill="rgba(255,180,205,.85)" stroke="rgba(215,120,155,.9)" stroke-width="1.5">'
    + '<rect x="6" y="8" width="4" height="32"/><rect x="24" y="8" width="4" height="32"/>'
    + '<rect x="3" y="15" width="28" height="4"/><rect x="3" y="28" width="28" height="4"/></g>',
  flower: '<g stroke="rgba(215,105,140,.9)" stroke-width="1.5">'
    + '<circle cx="24" cy="15" r="5" fill="rgba(255,215,230,.95)"/><circle cx="17" cy="21" r="5" fill="rgba(255,215,230,.95)"/>'
    + '<circle cx="31" cy="21" r="5" fill="rgba(255,215,230,.95)"/><circle cx="20" cy="28" r="5" fill="rgba(255,215,230,.95)"/>'
    + '<circle cx="28" cy="28" r="5" fill="rgba(255,215,230,.95)"/><circle cx="24" cy="21.5" r="4.5" fill="rgba(255,210,120,.95)"/></g>',
  lantern: '<rect x="20" y="4" width="8" height="4" fill="rgba(140,74,30,.9)"/>'
    + '<ellipse cx="24" cy="22" rx="12" ry="14" fill="rgba(255,122,60,.85)" stroke="rgba(200,90,32,.95)" stroke-width="2"/>'
    + '<path d="M14 22 H34 M24 8 V36" stroke="rgba(200,90,32,.85)" stroke-width="1.5"/>'
    + '<rect x="20" y="36" width="8" height="3" fill="rgba(140,74,30,.9)"/>'
    + '<path d="M24 39 V46" stroke="rgba(255,215,120,.95)" stroke-width="2"/>',
  star: '<path d="M24 6 L28 18 L41 18 L31 26 L35 38 L24 31 L13 38 L17 26 L7 18 L20 18 Z" fill="rgba(255,230,140,.9)"/>',
  moon: '<path d="M30 6 A16 16 0 1 0 42 30 A12 12 0 1 1 30 6 Z" fill="rgba(255,243,196,.9)"/>',
};

// 模块级样式（只注入一次）
let _styleEl = null;
function injectStyle() {
  if (_styleEl) return;
  const css = `
.wm-root{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;
  font-family:inherit;user-select:none;overflow:hidden;}
.wm-top{display:flex;align-items:center;gap:10px;padding:10px 12px;
  background:rgba(0,0,0,.30);flex:0 0 auto;}
.wm-back{flex:0 0 auto;padding:6px 14px;border:none;border-radius:20px;cursor:pointer;
  background:rgba(255,255,255,.22);color:#fff;font-weight:700;font-size:14px;}
.wm-back:active{transform:scale(.94);}
.wm-info{flex:1;min-width:0;text-shadow:0 1px 2px rgba(0,0,0,.45);}
.wm-info-name{font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wm-info-sub{font-size:12px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wm-tabs{display:flex;gap:8px;overflow-x:auto;padding:8px 12px;background:rgba(0,0,0,.18);
  flex:0 0 auto;scrollbar-width:none;}
.wm-tabs::-webkit-scrollbar{display:none;}
.wm-tab{flex:0 0 auto;padding:6px 14px;border:2px solid transparent;border-radius:16px;cursor:pointer;
  background:rgba(255,255,255,.16);color:#fff;font-weight:700;font-size:13px;white-space:nowrap;}
.wm-tab.active{background:#F0A81E;border-color:#FFE08A;color:#5A3A00;box-shadow:0 2px 6px rgba(0,0,0,.3);}
.wm-tab.locked{opacity:.55;cursor:not-allowed;}
.wm-scroll{flex:1;overflow-y:auto;position:relative;overscroll-behavior:contain;}
.wm-track{position:relative;}
.wm-path{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;
  filter:drop-shadow(0 2px 0 rgba(0,0,0,.18));}
.wm-deco{position:absolute;opacity:.32;pointer-events:none;z-index:0;}
.wm-node{position:absolute;transform:translate(-50%,-50%);width:54px;height:54px;border-radius:50%;
  border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35),inset 0 -4px 0 rgba(0,0,0,.16);
  background:radial-gradient(circle at 35% 30%,#9AD989,#4C9A4C);color:#fff;font-weight:800;
  cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:1px;z-index:2;padding:0;}
.wm-node.boss{width:66px;height:66px;background:radial-gradient(circle at 35% 30%,#FF9A6B,#D8503C);}
.wm-node.locked{background:radial-gradient(circle at 35% 30%,#BEBEBE,#8A8A8A);filter:saturate(.35);cursor:not-allowed;}
.wm-node.current{background:radial-gradient(circle at 35% 30%,#FFE08A,#F0A81E);
  animation:wmPulse 1.6s ease-out infinite;}
.wm-crown{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:17px;line-height:1;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.4));}
.wm-num{font-size:16px;line-height:1;text-shadow:0 1px 1px rgba(0,0,0,.4);}
.wm-stars{font-size:10px;letter-spacing:1px;line-height:1;color:#FFE066;text-shadow:0 1px 1px rgba(0,0,0,.5);}
.wm-lock{font-size:15px;line-height:1;}
.wm-mascot{position:absolute;z-index:2;pointer-events:none;
  filter:drop-shadow(0 3px 3px rgba(0,0,0,.3));animation:wmBob 1.8s ease-in-out infinite;}
@keyframes wmPulse{
  0%{box-shadow:0 0 0 0 rgba(255,214,90,.9),0 3px 8px rgba(0,0,0,.35);}
  70%{box-shadow:0 0 0 18px rgba(255,214,90,0),0 3px 8px rgba(0,0,0,.35);}
  100%{box-shadow:0 0 0 0 rgba(255,214,90,0),0 3px 8px rgba(0,0,0,.35);}}
@keyframes wmBob{0%,100%{transform:translateY(0);}50%{transform:translateY(-7px);}}
@keyframes wmShake{
  0%,100%{transform:translate(-50%,-50%);}
  25%{transform:translate(calc(-50% - 4px),-50%);}
  75%{transform:translate(calc(-50% + 4px),-50%);}}
.wm-deny{animation:wmShake .25s ease;}
@keyframes wmTabShake{0%,100%{transform:translateX(0);}25%{transform:translateX(-4px);}75%{transform:translateX(4px);}}
`;
  _styleEl = document.createElement('style');
  _styleEl.textContent = css;
  document.head.appendChild(_styleEl);
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

// 简易 DOM 工厂
function h(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}

// 章节短名（第一章…第八章，超出用数字）
function chLabel(id) {
  const cn = '一二三四五六七八九十';
  return id <= 10 ? `第${cn[id - 1]}章` : `第${id}章`;
}

// 在地图轨道上放置一个主题装饰
function placeDeco(track, inner, xPct, yPx, wPx, rot) {
  const d = h('div', 'wm-deco');
  d.style.left = xPct + '%';
  d.style.top = yPx + 'px';
  d.style.width = wPx + 'px';
  d.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
  d.innerHTML = `<svg viewBox="0 0 48 48" width="100%">${inner}</svg>`;
  track.appendChild(d);
}

// 按章节铺主题装饰
function applyThemeDeco(track, chId, trackH) {
  const rng = mulberry32(chId * 7919 + 13);
  const add = (key, size) => placeDeco(
    track, DECO_SVG[key],
    6 + rng() * 88,                     // x：避开正中线附近的节点带（±34% 内也会被低透明度弱化）
    40 + rng() * (trackH - 100),        // y
    size,
    (rng() - 0.5) * 18,                 // 轻微旋转
  );
  switch (chId) {
    case 1: for (let i = 0; i < 9; i++) add('grass', 44); for (let i = 0; i < 4; i++) add('cloud', 76); break;
    case 2: for (let i = 0; i < 7; i++) add('mountain', 92); break;
    case 3: for (let i = 0; i < 7; i++) add('cloud', 84); break;
    case 4: for (let i = 0; i < 8; i++) add('diamond', 50); break;
    case 5: for (let i = 0; i < 7; i++) add('pillar', 74); break;
    case 6: for (let i = 0; i < 5; i++) add('fence', 72); for (let i = 0; i < 6; i++) add('flower', 46); break;
    case 7: for (let i = 0; i < 7; i++) add('lantern', 62); break;
    case 8: for (let i = 0; i < 10; i++) add('star', 38); add('moon', 84); break;
    default: for (let i = 0; i < 6; i++) add('star', 40); break;
  }
}

// 平滑折线 → 二次贝塞尔路径（蜿蜒虚线用）
function pathD(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

// 节点星星行（已通关显示 ★，其余 ☆）
function starRow(n) {
  return `<span class="wm-stars">${'★'.repeat(n)}${'☆'.repeat(Math.max(0, 3 - n))}</span>`;
}

/**
 * 渲染世界地图到 container
 * @param {HTMLElement} container 容器节点
 * @param {object} api 见文件头注释的接口说明
 */
export function renderWorldMap(container, api) {
  if (!container) return;
  injectStyle();
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.innerHTML = '';

  const chapters = api.chapters || [];
  const curId = api.currentChapter ?? (chapters[0] && chapters[0].id) ?? 1;
  const ch = chapters.find(c => c.id === curId) || chapters[0] || { id: curId, name: '' };
  const theme = THEMES[curId] || THEMES[1];
  const levels = (api.levels || []).filter(l => l.chapter === curId).sort((a, b) => a.id - b.id);

  // —— 根节点（主题渐变背景）——
  const root = h('div', 'wm-root');
  root.style.background = theme.bg;
  // AI 章节背景图（压一层渐变遮罩，保证节点与文字可读）
  if (theme.img) {
    root.style.backgroundImage = `linear-gradient(180deg,rgba(20,12,4,.30),rgba(20,12,4,.08) 32%,rgba(20,12,4,.34)),url('${theme.img}')`;
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center 28%';
  }
  container.appendChild(root);

  // —— 顶栏：返回 + 章节信息条（名称/进度/星星/宝箱状态）——
  const top = h('div', 'wm-top');
  const back = h('button', 'wm-back', '← 返回');
  back.type = 'button';
  back.onclick = () => api.onBack && api.onBack();
  top.appendChild(back);

  const done = levels.filter(l => (api.levelStars(l.id) || 0) > 0).length;
  const totalStars = levels.reduce((a, l) => a + (api.levelStars(l.id) || 0), 0);
  const allThree = levels.length > 0 && levels.every(l => (api.levelStars(l.id) || 0) >= 3);
  const info = h('div', 'wm-info',
    `<div class="wm-info-name">${chLabel(ch.id)} · ${ch.name || ''}</div>`
    + `<div class="wm-info-sub">进度 ${done}/${levels.length} · ★${totalStars} · `
    + `🎁 <span title="${(ch.box || '').replace(/"/g, '&quot;')}">${allThree ? '宝箱可领取' : '宝箱未达成'}</span></div>`);
  top.appendChild(info);
  root.appendChild(top);

  // —— 章节 tab 横滑 ——
  const tabs = h('div', 'wm-tabs');
  for (const c of chapters) {
    const ok = api.chapterUnlocked ? api.chapterUnlocked(c) : true;
    const b = h('button', 'wm-tab'
      + (c.id === curId ? ' active' : '')
      + (ok ? '' : ' locked'),
      `${chLabel(c.id)}·${c.name || ''}${ok ? '' : ' 🔒'}`);
    b.type = 'button';
    b.onclick = () => {
      if (!ok) { // 未解锁：抖动提示
        b.style.animation = 'none'; void b.offsetWidth;
        b.style.animation = 'wmTabShake .25s ease';
        return;
      }
      api.setChapter && api.setChapter(c.id);
      // V5：显式覆盖 currentChapter（api.currentChapter 是渲染时的快照，直接传 api 会用旧值）
      renderWorldMap(container, Object.assign({}, api, { currentChapter: c.id }));
    };
    tabs.appendChild(b);
  }
  root.appendChild(tabs);

  // —— 地图滚动区 ——
  const scroll = h('div', 'wm-scroll');
  root.appendChild(scroll);

  const SPACING = 142;   // 相邻节点纵向间距
  const PAD_TOP = 84;
  const PAD_BOT = 96;
  const trackH = PAD_TOP + Math.max(levels.length, 1) * SPACING + PAD_BOT;
  const track = h('div', 'wm-track');
  track.style.height = trackH + 'px';
  scroll.appendChild(track);

  // 主题装饰（最底层）
  applyThemeDeco(track, curId, trackH);

  // —— 节点坐标：沿正弦曲线分布（x=中线±sin 摆动，y 随序号递增）——
  const pts = levels.map((lv, i) => [
    50 + Math.sin(i * 0.85 + curId * 1.3) * 32,   // x 百分比
    PAD_TOP + i * SPACING,                         // y 像素
  ]);

  // —— SVG 蜿蜒虚线路径（viewBox 0~100 匹配百分比，non-scaling-stroke 防变形）——
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'wm-path');
  svg.setAttribute('viewBox', `0 0 100 ${trackH}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', pathD(pts));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'rgba(255,255,255,.85)');
  path.setAttribute('stroke-width', '4');
  path.setAttribute('stroke-dasharray', '7 7');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(path);
  track.appendChild(svg);

  // 当前最高进度关卡（若在本章内则高亮脉冲 + 哈基喵站位）
  const curLv = levels.find(l => l.id === api.unlockedLevels) || null;

  // —— 关卡节点 ——
  let curNodeTop = 0;
  levels.forEach((lv, i) => {
    const [xPct, yPx] = pts[i];
    const stars = api.levelStars(lv.id) || 0;
    const unlocked = lv.id <= api.unlockedLevels;
    const isCur = curLv && lv.id === api.unlockedLevels;
    if (isCur) curNodeTop = yPx;

    const btn = h('button', 'wm-node'
      + (lv.boss ? ' boss' : '')
      + (unlocked ? '' : ' locked')
      + (isCur ? ' current' : ''));
    btn.type = 'button';
    btn.style.left = xPct + '%';
    btn.style.top = yPx + 'px';
    btn.title = lv.name || `关卡 ${lv.id}`;
    btn.innerHTML = (lv.boss ? '<span class="wm-crown">👑</span>' : '')
      + `<span class="wm-num">${lv.id}</span>`
      + (unlocked ? starRow(stars) : '<span class="wm-lock">🔒</span>');
    btn.onclick = () => {
      if (unlocked) { api.onSelect && api.onSelect(lv.id); return; }
      // 未解锁：抖动提示
      btn.classList.remove('deny'); void btn.offsetWidth; btn.classList.add('deny');
    };
    track.appendChild(btn);

    // 当前进度节点旁站着哈基喵 Q 版小立绘（小 canvas 用 drawAvatar 绘制）
    if (isCur) {
      const mc = document.createElement('canvas');
      mc.className = 'wm-mascot';
      const mw = 56, mh = 62;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      mc.width = mw * dpr; mc.height = mh * dpr;
      mc.style.width = mw + 'px'; mc.style.height = mh + 'px';
      const mctx = mc.getContext('2d');
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawAvatar(mctx, 'hajimiao', mw / 2, mh * 0.48, mh * 0.9, {});
      // 站在节点靠中线一侧（避免跑出屏幕）
      const side = xPct > 50 ? -1 : 1;
      mc.style.left = `calc(${xPct}% ${side > 0 ? '+' : '-'} ${52}px)`;
      mc.style.top = (yPx - 40) + 'px';
      track.appendChild(mc);
    }
  });

  // 滚动到当前进度节点附近
  requestAnimationFrame(() => {
    if (curNodeTop) {
      scroll.scrollTop = Math.max(0, curNodeTop - scroll.clientHeight / 2);
    }
  });
}
