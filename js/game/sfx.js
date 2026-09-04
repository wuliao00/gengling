// sfx.js — 《梗灵大陆》合成音效 + 芯片/音乐盒 BGM（WebAudio 全合成，零外部资源）
// 音色取向（按需求）：可爱、明亮、糖果感、马林巴/木琴/铃/音乐盒/软钢琴/拨弦/暖垫/轻打击；
//   短促、干净、悦耳；无暴力、无刺耳噪声、无长混响、无大爆炸。
// 用法：Sfx.play(name, opts) / Sfx.jingle(name) / Bgm.play(track) / Bgm.stop() / Bgm.kick()

const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);          // MIDI → 频率
const clampF = (f) => Math.max(20, Math.min(18000, f));

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

// ---- 可爱音色基元 ----
// 马林巴/音乐盒拨弦：基音+泛音，快起音、指数衰减
function pluck(ctx, dest, f, t0, dur, vol, opt = {}) {
  const harm = opt.harm != null ? opt.harm : 2;
  const hvol = opt.hvol != null ? opt.hvol : 0.35;
  const type = opt.type || 'sine';
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  g.connect(dest);
  const mk = (mult, vv, ty) => {
    const o = ctx.createOscillator();
    o.type = ty; o.frequency.setValueAtTime(clampF(f * mult), t0);
    const gg = ctx.createGain(); gg.gain.value = vv;
    o.connect(gg).connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
  };
  mk(1, 1, type);
  mk(harm, hvol, 'sine');
  mk(harm * 1.5, hvol * 0.4, 'sine');
}
// 铃/钟琴：明亮泛音
function bell(ctx, dest, f, t0, dur, vol) { pluck(ctx, dest, f, t0, dur, vol, { harm: 2.7, hvol: 0.3 }); }
// 高光叮：极短高音正弦
function sparkle(ctx, dest, f, t0, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(clampF(f), t0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.18);
  o.connect(g).connect(dest); o.start(t0); o.stop(t0 + 0.2);
}
// 卡通软"噗"：低通噪声（不刺耳）
function poof(ctx, dest, t0, dur, vol, cut = 1200) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(clampF(cut), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  src.connect(f).connect(g).connect(dest); src.start(t0); src.stop(t0 + dur + 0.02);
}
// 暖和声垫：持续失谐三角波（根音+五度）
function pad(ctx, dest, midi, t0, dur, vol) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  g.connect(dest);
  [0, 7].forEach((semi) => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(clampF(mf(midi + semi)), t0);
    o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
  });
}

// ============ 音效表（name → 合成函数）============
const SFX = {
  // —— UI ——
  click: (c, d, t) => pluck(c, d, 660, t, 0.09, 0.10),
  tap: (c, d, t) => pluck(c, d, 660, t, 0.08, 0.08),
  button: (c, d, t) => { pluck(c, d, 523, t, 0.10, 0.10); pluck(c, d, 784, t + 0.06, 0.12, 0.10); },
  confirm: (c, d, t) => { pluck(c, d, 523, t, 0.10, 0.10); pluck(c, d, 659, t + 0.07, 0.10, 0.10); pluck(c, d, 784, t + 0.14, 0.14, 0.11); },
  back: (c, d, t) => pluck(c, d, 392, t, 0.12, 0.09),
  cancel: (c, d, t) => { pluck(c, d, 330, t, 0.10, 0.08); poof(c, d, t, 0.08, 0.03, 900); },
  page: (c, d, t) => { [880, 1175, 1568].forEach((f, i) => sparkle(c, d, f, t + i * 0.04, 0.05)); },
  invalid: (c, d, t) => { pluck(c, d, 196, t, 0.14, 0.09, { type: 'triangle' }); poof(c, d, t, 0.10, 0.04, 700); },
  // —— 棋盘 ——
  swap: (c, d, t) => { pluck(c, d, 440, t, 0.07, 0.08); pluck(c, d, 587, t + 0.04, 0.07, 0.07); },
  match: (c, d, t, o) => { const st = (o && o.step) || 0; const b = 523 * Math.pow(2, st * 2 / 12); pluck(c, d, b, t, 0.14, 0.11); sparkle(c, d, b * 2, t + 0.02, 0.04); },
  four: (c, d, t) => { pluck(c, d, 659, t, 0.12, 0.11); pluck(c, d, 880, t + 0.06, 0.12, 0.11); sparkle(c, d, 1760, t + 0.1, 0.05); },
  five: (c, d, t) => { [784, 988, 1175, 1568].forEach((f, i) => bell(c, d, f, t + i * 0.05, 0.2, 0.10)); },
  combo1: (c, d, t) => { [659, 784].forEach((f, i) => pluck(c, d, f, t + i * 0.05, 0.12, 0.10)); },
  combo2: (c, d, t) => { [659, 784, 988].forEach((f, i) => pluck(c, d, f, t + i * 0.05, 0.12, 0.11)); },
  combo3: (c, d, t) => { [659, 784, 988, 1319].forEach((f, i) => pluck(c, d, f, t + i * 0.045, 0.12, 0.11)); },
  super: (c, d, t) => { [784, 988, 1175, 1568, 2093].forEach((f, i) => bell(c, d, f, t + i * 0.04, 0.22, 0.11)); poof(c, d, t, 0.2, 0.05, 1500); },
  pop: (c, d, t) => pluck(c, d, 880, t, 0.07, 0.09),
  bomb: (c, d, t) => { poof(c, d, t, 0.28, 0.10, 1400); pluck(c, d, 196, t, 0.2, 0.10, { type: 'triangle' }); },
  rainbow: (c, d, t) => { [523, 659, 784, 1046, 1319].forEach((f, i) => bell(c, d, f, t + i * 0.05, 0.25, 0.10)); },
  lineClear: (c, d, t) => { for (let i = 0; i < 6; i++) pluck(c, d, 523 * Math.pow(2, i / 6), t + i * 0.03, 0.1, 0.08); },
  areaPop: (c, d, t) => { poof(c, d, t, 0.22, 0.09, 1600); [392, 494, 587].forEach((f, i) => pluck(c, d, f, t + i * 0.04, 0.12, 0.09)); },
  fall: (c, d, t) => { for (let i = 0; i < 3; i++) pluck(c, d, 700 - i * 120, t + i * 0.04, 0.06, 0.05); },
  treasure: (c, d, t) => { bell(c, d, 988, t, 0.2, 0.10); bell(c, d, 1319, t + 0.08, 0.22, 0.10); sparkle(c, d, 2093, t + 0.16, 0.05); },
  chest: (c, d, t) => { bell(c, d, 659, t, 0.2, 0.10); bell(c, d, 988, t + 0.09, 0.22, 0.10); },
  coin: (c, d, t) => { pluck(c, d, 988, t, 0.08, 0.10); pluck(c, d, 1319, t + 0.05, 0.10, 0.10); },
  star: (c, d, t) => { bell(c, d, 1568, t, 0.22, 0.10); sparkle(c, d, 2093, t + 0.06, 0.05); },
  reward: (c, d, t) => { [784, 988, 1175].forEach((f, i) => bell(c, d, f, t + i * 0.06, 0.2, 0.10)); },
  // —— 战斗 ——
  skill: (c, d, t) => { pluck(c, d, 440, t, 0.16, 0.10); sparkle(c, d, 1320, t + 0.05, 0.05); },
  hit: (c, d, t) => { pluck(c, d, 330, t, 0.12, 0.11, { type: 'triangle' }); poof(c, d, t, 0.1, 0.05, 1200); },
  hurt: (c, d, t) => { pluck(c, d, 220, t, 0.18, 0.11, { type: 'triangle' }); poof(c, d, t, 0.12, 0.05, 800); },
  shield: (c, d, t) => { bell(c, d, 523, t, 0.2, 0.10); bell(c, d, 784, t + 0.06, 0.22, 0.09); },
  heal: (c, d, t) => { pluck(c, d, 659, t, 0.16, 0.09); pluck(c, d, 880, t + 0.07, 0.18, 0.09); },
  stun: (c, d, t) => { [880, 660].forEach((f, i) => sparkle(c, d, f, t + i * 0.07, 0.06)); },
  faint: (c, d, t) => { [392, 330, 262].forEach((f, i) => pluck(c, d, f, t + i * 0.09, 0.2, 0.10, { type: 'triangle' })); },
  boss: (c, d, t) => { pluck(c, d, 147, t, 0.4, 0.13, { type: 'triangle' }); poof(c, d, t, 0.3, 0.07, 600); },
  boss_skill: (c, d, t) => { pluck(c, d, 175, t, 0.35, 0.12, { type: 'triangle' }); poof(c, d, t, 0.25, 0.07, 800); sparkle(c, d, 1200, t + 0.1, 0.04); },
  enemy_atk: (c, d, t) => { pluck(c, d, 294, t, 0.16, 0.10, { type: 'triangle' }); poof(c, d, t, 0.12, 0.05, 1000); },
  // —— 角色专属招式（可爱、各具辨识度）——
  skill_hajimiao: (c, d, t) => { pluck(c, d, 523, t, 0.16, 0.10); pluck(c, d, 659, t + 0.06, 0.14, 0.10); pluck(c, d, 587, t + 0.14, 0.2, 0.09); },
  skill_dasangwang: (c, d, t) => { pluck(c, d, 196, t, 0.22, 0.13, { type: 'triangle' }); poof(c, d, t, 0.18, 0.07, 900); pluck(c, d, 294, t + 0.1, 0.18, 0.11, { type: 'triangle' }); },
  skill_feitianxia: (c, d, t) => { for (let i = 0; i < 5; i++) pluck(c, d, 440 * Math.pow(2, i / 5), t + i * 0.04, 0.1, 0.08); sparkle(c, d, 1760, t + 0.2, 0.05); },
  skill_zhuanzhuanjun: (c, d, t) => { for (let i = 0; i < 6; i++) pluck(c, d, 523 + i * 110, t + i * 0.05, 0.08, 0.08); bell(c, d, 1568, t + 0.32, 0.2, 0.10); },
  skill_zifengzhiwang: (c, d, t) => { pluck(c, d, 392, t, 0.2, 0.12, { type: 'triangle' }); bell(c, d, 784, t + 0.08, 0.2, 0.10); poof(c, d, t, 0.15, 0.05, 1000); },
  skill_xiaoniu: (c, d, t) => { pluck(c, d, 262, t, 0.3, 0.12, { type: 'triangle' }); pluck(c, d, 196, t + 0.12, 0.3, 0.11, { type: 'triangle' }); },
  skill_mianshifu: (c, d, t) => { for (let i = 0; i < 4; i++) pluck(c, d, 500 + Math.random() * 200, t + i * 0.06, 0.09, 0.07); bell(c, d, 1046, t + 0.26, 0.18, 0.09); },
  // —— 系统 ——
  levelup: (c, d, t) => { [523, 659, 784, 1046].forEach((f, i) => pluck(c, d, f, t + i * 0.07, 0.16, 0.11)); },
  slot: (c, d, t) => pluck(c, d, 800, t, 0.05, 0.07),
  energy: (c, d, t) => { pluck(c, d, 392, t, 0.14, 0.09); pluck(c, d, 587, t + 0.07, 0.16, 0.09); },
  opening: (c, d, t) => { [523, 659, 784, 1046].forEach((f, i) => bell(c, d, f, t + i * 0.1, 0.25, 0.11)); sparkle(c, d, 2093, t + 0.45, 0.05); },
};

export const Sfx = {
  ctx: null,
  muted: false,
  _masterBus: null,

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx.state === 'running' ? this.ctx : null;
    }
    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (AC) { this.ctx = new AC(); this._masterBus = null; }
    } catch (_) { /* 无音频环境 */ }
    return (this.ctx && this.ctx.state === 'running') ? this.ctx : null;
  },

  // 全局主总线：增益→压缩→空气低通，防削顶、统一响度
  _bus() {
    if (this._masterBus) return this._masterBus;
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const g = ctx.createGain(); g.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 8;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 15000; air.Q.value = 0.5;
      g.connect(comp); comp.connect(air); air.connect(ctx.destination);
      this._masterBus = g;
      return g;
    } catch (_) { return ctx.destination; }
  },

  has(name) { return !!SFX[name]; },

  setMuted(v) {
    this.muted = !!v;
    if (this.muted) Bgm.stop();
    else Bgm.kick();
  },

  play(name, opts = {}) {
    if (this.muted) return;
    const fn = SFX[name];
    if (!fn) return;
    try {
      const ctx = this.unlock();
      if (!ctx || ctx.state !== 'running') return;
      fn(ctx, this._bus() || ctx.destination, ctx.currentTime, opts);
    } catch (_) { /* 静默 */ }
  },

  // 小旋律（victory / three 三星 / failure / unlock）
  jingle(name = 'victory') {
    if (this.muted) return;
    const seqs = {
      victory: [[523, 0], [659, 110], [784, 220], [1046, 330], [1319, 470]],
      three: [[523, 0], [659, 90], [784, 180], [1046, 270], [1319, 360], [1568, 450], [2093, 560]],
      failure: [[392, 0], [330, 160], [262, 320]],
      defeat: [[392, 0], [330, 160], [262, 320]],
      unlock: [[523, 0], [659, 100], [784, 200], [880, 300], [1046, 420], [1568, 560]],
    };
    const seq = seqs[name];
    if (!seq) return;
    const self = this;
    for (const [f, dt] of seq) {
      setTimeout(() => {
        try {
          const ctx = self.ctx;
          if (!ctx || ctx.state !== 'running') return;
          bell(ctx, self._bus() || ctx.destination, f, ctx.currentTime, 0.22, 0.12);
        } catch (_) { /* 静默 */ }
      }, dt);
    }
  },
};

// ============ BGM（lookahead 音序器，马林巴主奏+暖垫+轻打击）============
// 每轨 32 步（4 小节 × 8 分音符）：lead 主旋律 / bass 低音 / pad 和声 / hat 踩镲；drum=1 加底鼓+军鼓
const TRACKS = {
  // 主菜单：欢快 welcoming
  menu: {
    bpm: 104, drum: 0, pad: [48, 45, 41, 43],
    lead: [72, 0, 76, 0, 79, 0, 76, 0, 77, 0, 81, 0, 79, 76, 72, 0,
      72, 0, 76, 0, 79, 0, 84, 0, 83, 79, 76, 74, 72, 0, 0, 0],
    bass: [48, 0, 55, 0, 45, 0, 52, 0, 41, 0, 48, 0, 43, 0, 50, 0,
      48, 0, 55, 0, 45, 0, 52, 0, 41, 0, 48, 0, 43, 0, 50, 0],
    hat: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0,
      1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1],
  },
  // 地图：轻冒险
  map: {
    bpm: 96, drum: 0, pad: [45, 43, 41, 40],
    lead: [69, 0, 72, 0, 76, 0, 72, 0, 74, 0, 77, 0, 76, 74, 69, 0,
      69, 0, 72, 0, 76, 0, 81, 0, 80, 76, 74, 72, 69, 0, 0, 0],
    bass: [45, 0, 52, 0, 43, 0, 50, 0, 41, 0, 48, 0, 43, 0, 47, 0,
      45, 0, 52, 0, 43, 0, 50, 0, 41, 0, 48, 0, 43, 0, 47, 0],
    hat: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0,
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1],
  },
  // 普通战斗：放松专注
  normal: {
    bpm: 132, drum: 1, pad: [45, 41, 43, 45],
    lead: [69, 0, 72, 76, 74, 0, 72, 0, 69, 0, 72, 76, 77, 76, 74, 72,
      69, 0, 72, 76, 79, 0, 77, 76, 74, 74, 72, 71, 69, 0, 0, 0],
    bass: [45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 43, 45, 45, 52, 45,
      45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 43, 45, 45, 52, 45],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1,
      1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
  },
  // 欢快战斗：bouncy
  upbeat: {
    bpm: 148, drum: 1, pad: [50, 48, 46, 45],
    lead: [74, 0, 74, 77, 76, 0, 74, 0, 72, 0, 74, 76, 77, 0, 76, 74,
      74, 0, 74, 77, 81, 0, 79, 77, 76, 76, 74, 72, 74, 0, 0, 0],
    bass: [50, 50, 57, 50, 48, 48, 55, 48, 46, 46, 53, 46, 48, 48, 55, 48,
      50, 50, 57, 50, 48, 48, 55, 48, 46, 46, 53, 46, 45, 45, 52, 45],
    hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1,
      1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  },
  // 高连击：energetic sparkling
  combo: {
    bpm: 156, drum: 1, pad: [52, 47, 45, 43],
    lead: [76, 0, 79, 0, 83, 0, 79, 0, 81, 0, 79, 76, 78, 76, 74, 0,
      76, 0, 79, 0, 84, 0, 83, 0, 81, 79, 78, 76, 79, 0, 76, 0],
    bass: [52, 52, 59, 52, 47, 47, 54, 47, 45, 45, 52, 45, 47, 47, 54, 47,
      52, 52, 59, 52, 47, 47, 54, 47, 45, 45, 52, 45, 43, 43, 50, 43],
    hat: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1,
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1],
  },
  // Boss：playfully tense（不恐怖）
  boss: {
    bpm: 144, drum: 1, pad: [38, 36, 34, 33],
    lead: [62, 0, 65, 62, 69, 0, 65, 0, 62, 0, 65, 62, 70, 69, 67, 65,
      60, 0, 63, 60, 67, 0, 63, 0, 62, 62, 65, 67, 69, 0, 74, 0],
    bass: [38, 38, 45, 38, 38, 38, 45, 38, 36, 36, 43, 36, 36, 36, 43, 36,
      34, 34, 41, 34, 34, 34, 41, 34, 33, 33, 40, 33, 38, 38, 45, 38],
    hat: [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1,
      1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1],
  },
  // 限时：urgent but cute（加轻 tick）
  time: {
    bpm: 160, drum: 1, pad: [48, 46, 45, 43],
    lead: [72, 72, 0, 76, 76, 0, 79, 0, 77, 77, 0, 76, 74, 0, 72, 0,
      72, 72, 0, 76, 76, 0, 81, 0, 80, 80, 0, 79, 77, 0, 76, 0],
    bass: [48, 48, 55, 48, 46, 46, 53, 46, 45, 45, 52, 45, 43, 43, 50, 43,
      48, 48, 55, 48, 46, 46, 53, 46, 45, 45, 52, 45, 43, 43, 50, 43],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  // 商店：cozy playful
  shop: {
    bpm: 100, drum: 0, pad: [43, 41, 40, 38],
    lead: [67, 0, 71, 0, 74, 0, 71, 0, 69, 0, 72, 0, 76, 72, 69, 0,
      67, 0, 71, 0, 74, 0, 79, 0, 78, 74, 71, 69, 67, 0, 0, 0],
    bass: [43, 0, 50, 0, 41, 0, 48, 0, 40, 0, 47, 0, 38, 0, 45, 0,
      43, 0, 50, 0, 41, 0, 48, 0, 40, 0, 47, 0, 38, 0, 45, 0],
    hat: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0,
      1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1],
  },
  // 活动：festive magical
  event: {
    bpm: 138, drum: 1, pad: [45, 43, 41, 45],
    lead: [69, 0, 76, 0, 81, 0, 76, 0, 74, 0, 81, 0, 84, 81, 74, 0,
      69, 0, 76, 0, 81, 0, 86, 0, 84, 81, 76, 74, 69, 0, 0, 0],
    bass: [45, 45, 52, 45, 43, 43, 50, 43, 41, 41, 48, 41, 45, 45, 52, 45,
      45, 45, 52, 45, 43, 43, 50, 43, 41, 41, 48, 41, 45, 45, 52, 45],
    hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1,
      1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
  },
  // 结算：gentle satisfied
  result: {
    bpm: 90, drum: 0, pad: [48, 45, 43, 41],
    lead: [72, 0, 0, 0, 76, 0, 0, 0, 79, 0, 0, 0, 76, 0, 72, 0,
      74, 0, 0, 0, 77, 0, 0, 0, 81, 0, 79, 0, 77, 0, 74, 0],
    bass: [48, 0, 0, 0, 55, 0, 0, 0, 45, 0, 0, 0, 52, 0, 0, 0,
      43, 0, 0, 0, 50, 0, 0, 0, 41, 0, 48, 0, 43, 0, 50, 0],
    hat: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  },
  // 加载：very light simple
  loading: {
    bpm: 80, drum: 0, pad: [48, 48, 45, 45],
    lead: [72, 0, 0, 0, 0, 0, 0, 0, 76, 0, 0, 0, 0, 0, 0, 0,
      79, 0, 0, 0, 0, 0, 0, 0, 84, 0, 0, 0, 0, 0, 0, 0],
    bass: [48, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0,
      48, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  // 暂停：calm minimal
  pause: {
    bpm: 72, drum: 0, pad: [45, 45, 43, 43],
    lead: [69, 0, 0, 0, 0, 0, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0,
      76, 0, 0, 0, 0, 0, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0],
    bass: [45, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0,
      45, 0, 0, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};
// 旧调用名别名，保持兼容
TRACKS.home = TRACKS.menu;
TRACKS.battle = TRACKS.normal;
TRACKS.battle2 = TRACKS.upbeat;
TRACKS.battle3 = TRACKS.combo;

export const Bgm = {
  want: null,
  track: null,
  timer: 0,
  master: null,
  step: 0,
  nextT: 0,
  stepDur: 0.25,

  play(name) {
    this.want = name;
    if (Sfx.muted) { this.stop(); return; }
    if (this.track === name && this.timer) return;
    this._start(name);
  },

  _start(name) {
    const ctx = Sfx.ctx || Sfx.unlock();
    if (!ctx || Sfx.muted) return;
    this._teardown();
    const t = TRACKS[name];
    if (!t) return;
    try {
      this.master = ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(Sfx._bus() || ctx.destination);
    } catch (_) { return; }
    this.track = name;
    this.step = 0;
    this.stepDur = 60 / t.bpm / 2;
    this.nextT = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._sched(t), 90);
    this._sched(t);
  },

  _sched(t) {
    if (!this.timer || !Sfx.ctx) return;
    const ctx = Sfx.ctx;
    const dest = this.master;
    try {
      while (this.nextT < ctx.currentTime + 0.35) {
        const i = this.step % 32;
        const time = this.nextT;
        if (t.lead[i]) pluck(ctx, dest, mf(t.lead[i]), time, this.stepDur * 0.9, 0.055);
        if (t.bass[i]) pluck(ctx, dest, mf(t.bass[i]), time, this.stepDur * 0.95, 0.07, { type: 'triangle', harm: 2, hvol: 0.2 });
        if (t.pad && i % 8 === 0) pad(ctx, dest, t.pad[(i / 8) % t.pad.length], time, this.stepDur * 7.6, 0.026);
        if (t.hat && t.hat[i]) poof(ctx, dest, time, 0.03, 0.012, 6000);
        if (t.drum) {
          if (i % 8 === 0 || i % 8 === 6) this._kick(time);
          if (i % 8 === 4) this._snare(time);
          if (i % 8 === 7) this._snare(time, 0.018);
        }
        this.step++;
        this.nextT += this.stepDur;
      }
    } catch (_) { /* 静默 */ }
  },

  _kick(time) {
    const ctx = Sfx.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(0.10, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    o.connect(g).connect(this.master);
    o.start(time); o.stop(time + 0.15);
  },
  _snare(time, vol = 0.04) {
    poof(Sfx.ctx, this.master, time, 0.08, vol, 2500);
  },

  _teardown() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    if (this.master) {
      try { this.master.gain.value = 0; this.master.disconnect(); } catch (_) {}
      this.master = null;
    }
    this.track = null;
  },

  stop() { this._teardown(); },

  kick() {
    if (Sfx.muted || !this.want) return;
    if (this.track === this.want && this.timer) return;
    this._start(this.want);
  },
};
