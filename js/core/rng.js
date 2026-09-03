// 可注入种子的随机数发生器（mulberry32），逻辑层专用，无 DOM 依赖。
export class RNG {
  constructor(seed = Date.now() % 2 ** 31) {
    this.seed = seed >>> 0;
    this._s = (this.seed || 1) >>> 0;
  }
  // 返回 [0,1)
  next() {
    this._s = (this._s + 0x6D2B79F5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // 返回 [0,n) 整数
  int(n) {
    return Math.floor(this.next() * n);
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}
