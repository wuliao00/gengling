// sfx.js — 《梗灵大陆》合成音效 + 芯片音乐 BGM（WebAudio 全合成，零外部资源）
// 用法：import { Sfx, Bgm } from './sfx.js';
//   Sfx.play('match', {step: chainIndex});    // 即时音效
//   Sfx.play('skill_hajimiao');               // 角色专属招式音
//   Bgm.play('home'|'battle'|'battle2'|'battle3'|'boss');  // 场景循环 BGM
// 无 AudioContext 环境（Node/jsdom/旧浏览器）自动静默降级。
//
// A 方案升级要点：
//  · 音色引擎：主振荡 + 失谐副振荡 + 低通滤波 + AD 包络 + 噪声层，比旧版单扫频更饱满、 less 刺耳
//  · 7 个角色各自专属招式音（猫叫/狗吼/飞行/转盘/剑鸣/牛哞/煮面）
//  · 开场音 opening、通用点击音 click
//  · 战斗 BGM 增至 3 首（battle/battle2/battle3）+ 底鼓/军鼓，主输出低通软化

// ---------- 共享：噪声缓冲（懒建，一次即可）----------
let _noise = null;
function noiseBuf(ctx) {
  if (_noise) return _noise;
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noise = buf;
  return buf;
}
const clampF = (f) => Math.max(20, Math.min(18000, f));

// ============ 即时音效描述表 ============
// 字段：type 波形, f0/f1 起止频率, fm 中间频率(可选，做 meow/siren 双段滑音), dur 时长,
//       vol 音量, atk 起音(秒), noise 噪声混合比(0-1), lp 低通截止(Hz), detune 副振荡失谐(音分)
const SPEAKER = {
  // UI / 系统
  click:    { type: 'square',   f0: 900,  f1: 1250, dur: 0.045, vol: 0.09, atk: 0.002, lp: 6500 },
  tap:      { type: 'square',   f0: 660,  f1: 660,  dur: 0.05,  vol: 0.08, lp: 5200 },
  button:   { type: 'triangle', f0: 520,  f1: 900,  dur: 0.085, vol: 0.13, lp: 7000, detune: 6 },
  back:     { type: 'sine',     f0: 620,  f1: 360,  dur: 0.09,  vol: 0.11 },
  invalid:  { type: 'square',   f0: 200,  f1: 120,  dur: 0.16,  vol: 0.12, lp: 1500, noise: 0.15 },
  // 棋盘
  swap:     { type: 'sine',     f0: 440,  f1: 700,  dur: 0.08,  vol: 0.12 },
  match:    { type: 'square',   f0: 523,  f1: 784,  dur: 0.12,  vol: 0.13, lp: 5200, detune: 5 },
  pop:      { type: 'sine',     f0: 880,  f1: 1320, dur: 0.06,  vol: 0.10 },
  bomb:     { type: 'sawtooth', f0: 210,  f1: 45,   dur: 0.34,  vol: 0.22, noise: 0.7, lp: 1700 },
  rainbow:  { type: 'sine',     f0: 523,  f1: 1250, dur: 0.42,  vol: 0.17, detune: 8, lp: 8500 },
  treasure: { type: 'triangle', f0: 784,  f1: 1568, dur: 0.30,  vol: 0.17, lp: 9000 },
  wind:     { type: 'sine',     f0: 280,  f1: 950,  dur: 0.32,  vol: 0.09, noise: 0.5, lp: 2600 },
  shuffle:  { type: 'triangle', f0: 400,  f1: 720,  dur: 0.14,  vol: 0.10, noise: 0.3 },
  ice:      { type: 'square',   f0: 1500, f1: 620,  dur: 0.14,  vol: 0.11, noise: 0.4, lp: 7500 },
  chain:    { type: 'square',   f0: 720,  f1: 300,  dur: 0.16,  vol: 0.11, noise: 0.35, lp: 3200 },
  // 战斗
  skill:    { type: 'sawtooth', f0: 330,  f1: 990,  dur: 0.30,  vol: 0.15, lp: 4200 },
  hit:      { type: 'square',   f0: 340,  f1: 110,  dur: 0.15,  vol: 0.19, noise: 0.4, lp: 2400 },
  hurt:     { type: 'sawtooth', f0: 210,  f1: 85,   dur: 0.24,  vol: 0.19, noise: 0.3, lp: 1500 },
  shield:   { type: 'triangle', f0: 500,  f1: 1450, dur: 0.22,  vol: 0.17, detune: 10, lp: 8500, noise: 0.18 },
  heal:     { type: 'sine',     f0: 660,  f1: 1000, dur: 0.22,  vol: 0.13 },
  boss_skill:{ type: 'sawtooth',f0: 150,  f1: 60,   dur: 0.50,  vol: 0.22, noise: 0.6, lp: 1300 },
  enemy_atk:{ type: 'sawtooth', f0: 300,  f1: 120,  dur: 0.20,  vol: 0.15, noise: 0.35, lp: 1900 },
  stun:     { type: 'triangle', f0: 760,  f1: 380,  dur: 0.22,  vol: 0.13, detune: 14 },
  faint:    { type: 'sawtooth', f0: 300,  f1: 90,   dur: 0.40,  vol: 0.15, lp: 1300 },
  // 奖励 / 结算
  coin:     { type: 'square',   f0: 988,  f1: 1319, dur: 0.09,  vol: 0.12 },
  levelup:  { type: 'square',   f0: 523,  f1: 1046, dur: 0.35,  vol: 0.17, detune: 6 },
  slot:     { type: 'square',   f0: 800,  f1: 800,  dur: 0.04,  vol: 0.08 },
  star:     { type: 'triangle', f0: 1046, f1: 2093, dur: 0.25,  vol: 0.15, lp: 9000 },
  chest:    { type: 'triangle', f0: 659,  f1: 1319, dur: 0.35,  vol: 0.17 },
  energy:   { type: 'sine',     f0: 392,  f1: 1175, dur: 0.30,  vol: 0.15 },
  boss:     { type: 'sawtooth', f0: 110,  f1: 55,   dur: 0.50,  vol: 0.20, noise: 0.3, lp: 950 },
  victory:  { type: 'square',   f0: 523,  f1: 1046, dur: 0.60,  vol: 0.18 },
  defeat:   { type: 'sawtooth', f0: 330,  f1: 110,  dur: 0.60,  vol: 0.16, lp: 1300 },
  // 角色专属招式（单段描述；zhuanzhuanjun/mianshifu/opening 走 CUSTOM 多段）
  skill_hajimiao:      { type: 'sine',     f0: 520, fm: 900, f1: 420,  dur: 0.30, vol: 0.18, lp: 5200 },
  skill_dasangwang:    { type: 'sawtooth', f0: 280, f1: 90,           dur: 0.26, vol: 0.22, noise: 0.6, lp: 1500 },
  skill_feitianxia:    { type: 'sine',     f0: 300, f1: 1500,         dur: 0.34, vol: 0.15, noise: 0.45, lp: 6500 },
  skill_zifengzhiwang: { type: 'square',   f0: 920, f1: 480,          dur: 0.28, vol: 0.17, detune: 20, noise: 0.35, lp: 8500 },
  skill_xiaoniu:       { type: 'sawtooth', f0: 190, fm: 150, f1: 110, dur: 0.40, vol: 0.19, lp: 850 },
};

export const Sfx = {
  ctx: null,
  muted: false,

  /** 首次用户手势后调用以解锁音频 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx.state === 'running' ? this.ctx : null;
    }
    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (AC) this.ctx = new AC();
    } catch (_) { /* 无音频环境 */ }
    return (this.ctx && this.ctx.state === 'running') ? this.ctx : null;
  },

  /** 是否已定义某音效名 */
  has(name) { return !!(CUSTOM[name] || SPEAKER[name]); },

  setMuted(v) {
    this.muted = !!v;
    if (this.muted) Bgm.stop();
    else Bgm.kick();
  },

  // ---- 底层发声单元 ----
  /** 单振荡(+失谐副振荡)+低通+AD 包络 */
  _osc(o) {
    const ctx = this.ctx, t0 = o.t0, dur = o.dur;
    const gain = ctx.createGain();
    const atk = o.atk != null ? o.atk : 0.005;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(o.vol, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    let tail = gain;
    if (o.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(clampF(o.lp), t0); lp.Q.value = 0.7;
      gain.connect(lp); tail = lp;
    }
    tail.connect(o.dest || ctx.destination);
    const mk = (det) => {
      const osc = ctx.createOscillator();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(clampF(o.f0), t0);
      if (o.fm) osc.frequency.exponentialRampToValueAtTime(clampF(o.fm), t0 + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(clampF(o.f1), t0 + dur);
      if (det) osc.detune.setValueAtTime(det, t0);
      osc.connect(gain);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    };
    mk(0);
    if (o.detune) mk(o.detune);   // 副振荡加厚
  },

  /** 噪声打击（爆炸/受击/气声/军鼓）*/
  _noiseHit(o) {
    const ctx = this.ctx, t0 = o.t0, dur = o.dur;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(o.vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    let node = src;
    if (o.lp || o.hp) {
      const f = ctx.createBiquadFilter();
      f.type = o.hp ? 'highpass' : 'lowpass';
      f.frequency.setValueAtTime(clampF(o.hp || o.lp), t0); f.Q.value = 0.8;
      src.connect(f); node = f;
    }
    node.connect(gain).connect(o.dest || ctx.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  /**
   * 播放音效
   * @param {string} name SPEAKER/CUSTOM 键名
   * @param {object} opts {step: 连锁数（match 升调）}
   */
  play(name, opts = {}) {
    if (this.muted) return;
    if (!CUSTOM[name] && !SPEAKER[name]) return;
    try {
      const ctx = this.unlock();
      if (!ctx || ctx.state !== 'running') return;
      const t0 = ctx.currentTime;
      if (CUSTOM[name]) { CUSTOM[name](ctx, ctx.destination, t0, this); return; }

      const spec = SPEAKER[name];
      const shift = name === 'match' ? Math.pow(2, (opts.step || 0) * 2 / 12) : 1;
      const s = Object.assign({}, spec);
      s.f0 *= shift; s.f1 *= shift; if (s.fm) s.fm *= shift;
      s.t0 = t0; s.dest = ctx.destination;
      this._osc(s);
      if (s.noise > 0) {
        this._noiseHit({ t0, dur: s.dur * 0.9, vol: s.vol * s.noise, lp: s.lp || 3000, dest: ctx.destination });
      }
      // 消除类叠加高频"闪粉"层，听感更脆
      if (name === 'match' || name === 'star' || name === 'chest' || name === 'treasure') {
        this._osc({ type: 'sine', f0: s.f1 * 2, f1: s.f1 * 2.6, dur: s.dur * 0.7, vol: s.vol * 0.3, atk: 0.002, t0, dest: ctx.destination });
      }
    } catch (_) { /* 静默 */ }
  },

  /** 小旋律（victory/defeat/unlock）*/
  jingle(name = 'victory') {
    if (this.muted) return;
    const seqs = {
      victory: [[523, 0], [659, 110], [784, 220], [1046, 330], [1318, 470]],
      defeat:  [[392, 0], [330, 160], [262, 320]],
      unlock:  [[523, 0], [659, 100], [784, 200], [880, 300], [1046, 420], [1568, 560]],
    };
    const seq = seqs[name];
    if (!seq) return;
    const self = this;
    for (const [f, dt] of seq) {
      setTimeout(() => {
        try {
          const ctx = self.ctx;
          if (!ctx || ctx.state !== 'running') return;
          const t0 = ctx.currentTime;
          self._osc({ type: 'square', f0: f, f1: f, dur: 0.16, vol: 0.15, detune: 5, lp: 7000, t0, dest: ctx.destination });
        } catch (_) { /* 静默 */ }
      }, dt);
    }
  },
};

// ============ 多段自定义音（转盘/煮面/开场）============
const CUSTOM = {
  // 转转君·命运转盘：一串快速上移咔哒 + 收尾叮
  skill_zhuanzhuanjun(ctx, dest, t0, S) {
    for (let i = 0; i < 7; i++) {
      S._osc({ type: 'square', f0: 560 + i * 130, f1: 560 + i * 130, dur: 0.05, vol: 0.11, atk: 0.002, lp: 6500, t0: t0 + i * 0.055, dest });
    }
    S._osc({ type: 'triangle', f0: 1250, f1: 1900, dur: 0.20, vol: 0.13, lp: 9000, t0: t0 + 0.42, dest });
  },
  // 面师傅·忘情一碗面：咕嘟气泡 + 碗筷叮
  skill_mianshifu(ctx, dest, t0, S) {
    for (let i = 0; i < 6; i++) {
      const f = 300 + Math.round(Math.random() * 280);
      S._osc({ type: 'sine', f0: f * 0.6, f1: f, dur: 0.09, vol: 0.10, t0: t0 + i * 0.07, dest });
    }
    S._osc({ type: 'triangle', f0: 1400, f1: 2100, dur: 0.16, vol: 0.12, lp: 9000, t0: t0 + 0.44, dest });
    S._noiseHit({ t0: t0 + 0.44, dur: 0.12, vol: 0.04, hp: 4000, dest });
  },
  // 开场：上行小号角 + 星光噪声
  opening(ctx, dest, t0, S) {
    [523, 659, 784, 1046].forEach((f, i) =>
      S._osc({ type: 'triangle', f0: f, f1: f, dur: 0.17, vol: 0.15, detune: 6, lp: 9000, t0: t0 + i * 0.11, dest }));
    S._noiseHit({ t0: t0 + 0.44, dur: 0.35, vol: 0.05, hp: 4200, dest });
  },
};

// ============ 芯片音乐 BGM（lookahead 调度音序器）============
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);   // MIDI 音高 → 频率

// 每轨 32 步（4 小节 × 8 分音符）：lead 主旋律 / bass 低音 / hat 踩镲；drum=1 加底鼓+军鼓
const TRACKS = {
  // 首页/地图：C 大调，轻快蹦跳（无鼓，柔和）
  home: {
    bpm: 108, drum: 0,
    lead: [72, 0, 76, 0, 79, 0, 76, 0,  77, 0, 81, 0, 79, 76, 72, 0,
           72, 0, 76, 0, 79, 0, 84, 0,  83, 79, 76, 74, 72, 0, 0, 0],
    bass: [48, 0, 55, 0, 45, 0, 52, 0,  41, 0, 48, 0, 43, 0, 50, 0,
           48, 0, 55, 0, 45, 0, 52, 0,  41, 0, 48, 0, 43, 0, 50, 0],
    hat:  [1, 0, 0, 0, 1, 0, 0, 1,  1, 0, 0, 0, 1, 0, 1, 0,
           1, 0, 0, 0, 1, 0, 0, 1,  1, 0, 0, 0, 1, 0, 1, 1],
  },
  // 战斗①：A 小调，紧凑推进
  battle: {
    bpm: 138, drum: 1,
    lead: [69, 0, 72, 76, 74, 0, 72, 0,  69, 0, 72, 76, 77, 76, 74, 72,
           69, 0, 72, 76, 79, 0, 77, 76,  74, 74, 72, 71, 69, 0, 0, 0],
    bass: [45, 45, 52, 45, 41, 41, 48, 41,  43, 43, 50, 43, 45, 45, 52, 45,
           45, 45, 52, 45, 41, 41, 48, 41,  43, 43, 50, 43, 45, 45, 52, 45],
    hat:  [1, 0, 1, 0, 1, 0, 1, 1,  1, 0, 1, 0, 1, 0, 1, 1,
           1, 0, 1, 0, 1, 0, 1, 1,  1, 0, 1, 0, 1, 1, 1, 1],
  },
  // 战斗②：D 小调，更激进（切分更强）
  battle2: {
    bpm: 150, drum: 1,
    lead: [74, 0, 74, 77, 76, 0, 74, 0,  72, 0, 74, 76, 77, 0, 76, 74,
           74, 0, 74, 77, 81, 0, 79, 77,  76, 76, 74, 72, 74, 0, 0, 0],
    bass: [50, 50, 57, 50, 48, 48, 55, 48,  46, 46, 53, 46, 48, 48, 55, 48,
           50, 50, 57, 50, 48, 48, 55, 48,  46, 46, 53, 46, 45, 45, 52, 45],
    hat:  [1, 0, 1, 1, 1, 0, 1, 0,  1, 0, 1, 1, 1, 0, 1, 1,
           1, 0, 1, 1, 1, 0, 1, 0,  1, 1, 1, 0, 1, 1, 1, 1],
  },
  // 战斗③：E 小调，旋律性/英雄感
  battle3: {
    bpm: 132, drum: 1,
    lead: [76, 0, 79, 0, 83, 0, 79, 0,  81, 0, 79, 76, 78, 76, 74, 0,
           76, 0, 79, 0, 84, 0, 83, 0,  81, 79, 78, 76, 79, 0, 76, 0],
    bass: [52, 52, 59, 52, 47, 47, 54, 47,  45, 45, 52, 45, 47, 47, 54, 47,
           52, 52, 59, 52, 47, 47, 54, 47,  45, 45, 52, 45, 43, 43, 50, 43],
    hat:  [1, 0, 0, 1, 1, 0, 0, 1,  1, 0, 0, 1, 1, 0, 1, 1,
           1, 0, 0, 1, 1, 0, 0, 1,  1, 0, 0, 1, 1, 1, 1, 1],
  },
  // Boss：D 小调，低音压迫
  boss: {
    bpm: 148, drum: 1,
    lead: [62, 0, 65, 62, 69, 0, 65, 0,  62, 0, 65, 62, 70, 69, 67, 65,
           60, 0, 63, 60, 67, 0, 63, 0,  62, 62, 65, 67, 69, 0, 74, 0],
    bass: [38, 38, 45, 38, 38, 38, 45, 38,  36, 36, 43, 36, 36, 36, 43, 36,
           34, 34, 41, 34, 34, 34, 41, 34,  33, 33, 40, 33, 38, 38, 45, 38],
    hat:  [1, 1, 0, 1, 1, 0, 1, 1,  1, 1, 0, 1, 1, 0, 1, 1,
           1, 1, 0, 1, 1, 0, 1, 1,  1, 1, 0, 1, 1, 1, 1, 1],
  },
};

export const Bgm = {
  want: null,      // 期望曲目（未解锁音频时记忆，unlock 后自动起播）
  track: null,     // 正在播放
  timer: 0,
  master: null,
  lp: null,
  step: 0,
  nextT: 0,
  stepDur: 0.25,

  /** 切换/起播曲目；静音或同名在播则跳过 */
  play(name) {
    this.want = name;
    if (Sfx.muted) { this.stop(); return; }
    if (this.track === name && this.timer) return;
    this._start(name);
  },

  _start(name) {
    const ctx = Sfx.ctx || Sfx.unlock();
    if (!ctx || Sfx.muted) return;            // 音频未解锁/静音，等 kick()
    this._teardown();
    const t = TRACKS[name];
    if (!t) return;
    try {
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      // 主输出低通软化，削弱方波刺耳感
      this.lp = ctx.createBiquadFilter();
      this.lp.type = 'lowpass'; this.lp.frequency.value = 7200; this.lp.Q.value = 0.6;
      this.master.connect(this.lp).connect(ctx.destination);
    } catch (_) { return; }
    this.track = name;
    this.step = 0;
    this.stepDur = 60 / t.bpm / 2;            // 8 分音符步长
    this.nextT = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._sched(t), 90);
    this._sched(t);
  },

  _sched(t) {
    if (!this.timer || !Sfx.ctx) return;
    try {
      while (this.nextT < Sfx.ctx.currentTime + 0.35) {
        const i = this.step % 32;
        const time = this.nextT;
        if (t.lead[i]) this._note(t.lead[i], time, this.stepDur * 0.9, 'square', 0.05);
        if (t.bass[i]) this._note(t.bass[i], time, this.stepDur * 0.95, 'triangle', 0.075);
        if (t.hat[i]) this._hat(time);
        if (t.drum) {
          if (i % 8 === 0) this._kick(time);
          if (i % 8 === 4) this._snare(time);
        }
        this.step++;
        this.nextT += this.stepDur;
      }
    } catch (_) { /* 静默 */ }
  },

  _note(midi, time, dur, type, vol) {
    const ctx = Sfx.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = mf(midi);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g).connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  },

  _hat(time) {
    Sfx._noiseHit({ t0: time, dur: 0.03, vol: 0.014, hp: 7500, dest: this.master });
  },
  _kick(time) {
    const ctx = Sfx.ctx;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(0.11, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    osc.connect(g).connect(this.master);
    osc.start(time); osc.stop(time + 0.15);
  },
  _snare(time) {
    Sfx._noiseHit({ t0: time, dur: 0.09, vol: 0.05, hp: 1600, dest: this.master });
  },

  _teardown() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.master) {
      try { this.master.gain.value = 0; this.master.disconnect(); } catch (_) {}
      this.master = null;
    }
    if (this.lp) { try { this.lp.disconnect(); } catch (_) {} this.lp = null; }
    this.track = null;
  },

  /** 停止 BGM */
  stop() { this._teardown(); },

  /** 音频解锁/取消静音后尝试起播期望曲目 */
  kick() {
    if (Sfx.muted || !this.want) return;
    if (this.track === this.want && this.timer) return;
    this._start(this.want);
  },
};
