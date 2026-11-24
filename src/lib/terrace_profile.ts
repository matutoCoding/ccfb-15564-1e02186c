import type { TerraceParams } from '../types.ts';
import { clamp, mod1, smoothstep } from './math.ts';

export function terraceTransitionHalfPhase(
  gradientMagnitude: number,
  params: Pick<TerraceParams, 'riserHeight' | 'benchWidth' | 'riserMaxAngleDeg'>
): number {
  const h = params.riserHeight;
  const g = gradientMagnitude;
  const tanRiserMax = Math.tan((params.riserMaxAngleDeg * Math.PI) / 180);
  let t = 0.5 - (params.benchWidth * g) / (2 * h);
  const tMin = g > 1e-8 ? g / (2 * Math.max(0.05, tanRiserMax)) : 0.02;
  return clamp(t, Math.min(0.46, tMin), 0.46);
}

export function terraceIdealFromElevation(
  y: number,
  gradientMagnitude: number,
  params: Pick<TerraceParams, 'riserHeight' | 'benchWidth' | 'riserMaxAngleDeg' | 'reverseSlope'>,
  base: number
): number {
  const h = params.riserHeight;
  const g = gradientMagnitude;
  const rel = (y - base) / h;
  const q = Math.floor(rel);
  const f = rel - q;
  const t = terraceTransitionHalfPhase(g, params);

  let ideal: number;
  if (f <= 0.5 - t) {
    ideal = q * h + base;
  } else if (f >= 0.5 + t) {
    ideal = (q + 1) * h + base;
  } else {
    const u = (f - (0.5 - t)) / (2 * t);
    const s = u * u * (3 - 2 * u);
    ideal = (q + s) * h + base;
  }

  if (params.reverseSlope !== 0) {
    const centerPhase = mod1(f + 0.5) - 0.5;
    const crossMeters = clamp((centerPhase * h) / Math.max(g, 0.08), -params.benchWidth, params.benchWidth);
    const treadWeight = 1 - smoothstep(0.5 - t, 0.5, Math.abs(f - 0.5));
    ideal += params.reverseSlope * crossMeters * treadWeight;
  }
  return ideal;
}

export function terraceBuildFactor(slopeDeg: number, maxSlopeDeg: number): number {
  return 1 - smoothstep(maxSlopeDeg - 3, maxSlopeDeg, slopeDeg);
}
