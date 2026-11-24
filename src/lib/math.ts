export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const degToRad = (deg: number) => (deg * Math.PI) / 180;

export const radToDeg = (rad: number) => (rad * 180) / Math.PI;

export const mod1 = (v: number) => v - Math.floor(v);

export function hash2(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = smoothstep(0, 1, x - xi);
  const tz = smoothstep(0, 1, z - zi);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function fbm(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x * frequency, z * frequency);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / norm;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bilinearSample(
  data: Float32Array,
  cols: number,
  rows: number,
  u: number,
  v: number
): number {
  const x = clamp(u * (cols - 1), 0, cols - 1);
  const z = clamp(v * (rows - 1), 0, rows - 1);
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = Math.min(cols - 1, x0 + 1);
  const z1 = Math.min(rows - 1, z0 + 1);
  const tx = x - x0;
  const tz = z - z0;
  const i00 = z0 * cols + x0;
  const i10 = z0 * cols + x1;
  const i01 = z1 * cols + x0;
  const i11 = z1 * cols + x1;
  return lerp(lerp(data[i00], data[i10], tx), lerp(data[i01], data[i11], tx), tz);
}

export function sampleWorldGrid(
  data: Float32Array,
  cols: number,
  rows: number,
  cellX: number,
  cellZ: number,
  originX: number,
  originZ: number,
  x: number,
  z: number
): number {
  const u = (x - originX) / ((cols - 1) * cellX);
  const v = (z - originZ) / ((rows - 1) * cellZ);
  return bilinearSample(data, cols, rows, u, v);
}

export function formatNumber(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '--';
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
