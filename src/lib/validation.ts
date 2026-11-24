import type { TerraceParams, TerrainGrid } from '../types.ts';
import { createTerrainGrid, computeSlopeAspect } from './terrain.ts';
import { createDefaultTerraceParams, generateTerraces, terraceIdealFromElevation } from './terrace.ts';

export interface EarthworkValidationCase {
  name: string;
  kind: 'plane' | 'cone';
  resolution: number;
  computedCut: number;
  computedFill: number;
  referenceCut: number;
  referenceFill: number;
  cutErrorPct: number;
  fillErrorPct: number;
  balancePct: number;
  netErrorPct: number;
  passed: boolean;
}

export interface EarthworkValidationReport {
  tolerancePct: number;
  allPassed: boolean;
  cases: EarthworkValidationCase[];
}

export function analyticHeight(kind: 'plane' | 'cone', x: number, z: number, size: number, slopeDeg: number): number {
  const g = Math.tan((slopeDeg * Math.PI) / 180);
  if (kind === 'plane') {
    return 18 + g * (x + size * 0.5);
  }
  const r = Math.hypot(x, z);
  return 58 - g * r;
}

export function createAnalyticTerrain(
  kind: 'plane' | 'cone',
  segments: number,
  size: number,
  slopeDeg: number
): TerrainGrid {
  const cols = segments + 1;
  const data = new Float32Array(cols * cols);
  const cell = size / segments;
  for (let iz = 0; iz < cols; iz++) {
    const z = -size * 0.5 + iz * cell;
    for (let ix = 0; ix < cols; ix++) {
      const x = -size * 0.5 + ix * cell;
      data[iz * cols + ix] = analyticHeight(kind, x, z, size, slopeDeg);
    }
  }
  return createTerrainGrid(`解析${kind}`, cols, cols, cell, cell, data, 'generated', -size / 2, -size / 2);
}

// 用远密于生产网格的中点积分直接核对解析设计面。
export function referenceAnalyticEarthwork(
  kind: 'plane' | 'cone',
  size: number,
  slopeDeg: number,
  params: TerraceParams,
  base: number,
  referenceSegments = 2048
) {
  const cell = size / referenceSegments;
  const area = cell * cell;
  const g = Math.tan((slopeDeg * Math.PI) / 180);
  let cut = 0;
  let fill = 0;

  for (let iz = 0; iz < referenceSegments; iz++) {
    const z = -size * 0.5 + (iz + 0.5) * cell;
    for (let ix = 0; ix < referenceSegments; ix++) {
      const x = -size * 0.5 + (ix + 0.5) * cell;
      const y = analyticHeight(kind, x, z, size, slopeDeg);
      const ideal = terraceIdealFromElevation(y, g, params, base);
      const d = y - ideal;
      if (d > 0) cut += d * area;
      else fill += -d * area;
    }
  }
  return { cut, fill };
}

export function validateEarthwork(tolerancePct = 1): EarthworkValidationReport {
  const cases: EarthworkValidationCase[] = [];
  const resolutions = [256, 512, 1024];

  for (const kind of ['plane', 'cone'] as const) {
    for (const resolution of resolutions) {
      const size = 120;
      // 斜面取 g*size = 30*H，使计算域恰好包含完整相位，额外核对理想挖填平衡。
      const slopeDeg = kind === 'plane' ? Math.atan(30 * 1.2 / size) * 180 / Math.PI : 20;
      const terrain = createAnalyticTerrain(kind, resolution, size, slopeDeg);
      const slope = computeSlopeAspect(terrain);
      const params: TerraceParams = {
        ...createDefaultTerraceParams(),
        benchWidth: 3,
        riserHeight: 1.2,
        reverseSlope: 0,
        edgeFadeCells: 0,
        baseElevation: Math.floor(terrain.minElev / 1.2) * 1.2
      };
      const result = generateTerraces(terrain, slope, params);
      const ref = referenceAnalyticEarthwork(kind, size, slopeDeg, params, result.params.baseElevation ?? params.baseElevation ?? 0);
      const cutErrorPct = Math.abs(result.volumes.totalCut - ref.cut) / Math.max(ref.cut, 1e-9) * 100;
      const fillErrorPct = Math.abs(result.volumes.totalFill - ref.fill) / Math.max(ref.fill, 1e-9) * 100;
      const maxError = Math.max(cutErrorPct, fillErrorPct);
      const refScale = (ref.cut + ref.fill) * 0.5;
      const netErrorPct = Math.abs(result.volumes.net - (ref.cut - ref.fill)) / Math.max(refScale, 1e-9) * 100;
      cases.push({
        name: `${kind === 'plane' ? '解析斜面' : '解析圆锥面'} / ${resolution} 格`,
        kind,
        resolution,
        computedCut: result.volumes.totalCut,
        computedFill: result.volumes.totalFill,
        referenceCut: ref.cut,
        referenceFill: ref.fill,
        cutErrorPct,
        fillErrorPct,
        balancePct: result.volumes.balanceErrorPct,
        netErrorPct,
        passed: maxError < tolerancePct && netErrorPct < tolerancePct
      });
    }
  }

  return {
    tolerancePct,
    allPassed: cases.every((c) => c.passed),
    cases
  };
}
