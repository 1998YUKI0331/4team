/** 결정론적 난수. 같은 시드 → 항상 같은 결과 (공고별 밸런스 고정용) */

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngRange = (rng, lo, hi) => lo + rng() * (hi - lo);
export const rngInt = (rng, lo, hi) => Math.floor(lo + rng() * (hi - lo + 1));
export const rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/** 표준정규분포 (Box–Muller) */
export function rngNormal(rng, mean = 0, sd = 1) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** 게임 런타임용 전역 RNG (플레이마다 달라짐) */
let _runtime = makeRng(Date.now() >>> 0);
export function seedRuntime(seed) { _runtime = makeRng(seed); }
export function rand() { return _runtime(); }
export function randInt(lo, hi) { return rngInt(_runtime, lo, hi); }
export function randRange(lo, hi) { return rngRange(_runtime, lo, hi); }
export function randPick(arr) { return rngPick(_runtime, arr); }
export function randNormal(mean, sd) { return rngNormal(_runtime, mean, sd); }
export function chance(p) { return _runtime() < p; }
