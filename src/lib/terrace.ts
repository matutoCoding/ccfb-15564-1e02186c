import type {
  SlopeGrid,
  TerraceParams,
  TerraceResult,
  TerrainGrid
} from '../types.ts';
import { clamp, mod1, smoothstep, uid } from './math.ts';
import { computeRefinedTerraceEarthwork } from './refined_earthwork.ts';
import { terraceBuildFactor, terraceIdealFromElevation } from './terrace_profile.ts';

export { terraceIdealFromElevation } from './terrace_profile.ts';

export function createDefaultTerraceParams(): TerraceParams {
  return {
    riserHeight: 1.2,
    benchWidth: 3.0,
    maxSlopeDeg: 25,
    riserMaxAngleDeg: 68,
    reverseSlope: 0,
    edgeFadeCells: 0,
    baseElevation: null
  };
}

export function generateTerraces(
  terrain: TerrainGrid,
  slope: SlopeGrid,
  params: TerraceParams
): TerraceResult {
  const n = terrain.cols * terrain.rows;
  const designed = new Float32Array(n);
  const benchIds = new Int32Array(n);
  const buildable = new Uint8Array(n);
  const factorGrid = new Float32Array(n);

  const h = params.riserHeight;
  const base = params.baseElevation ?? Math.floor(terrain.minElev / h) * h;
  const tanRiserMax = Math.tan((params.riserMaxAngleDeg * Math.PI) / 180);
  let minBench = Infinity;
  let maxBench = -Infinity;

  for (let z = 0; z < terrain.rows; z++) {
    for (let x = 0; x < terrain.cols; x++) {
      const i = z * terrain.cols + x;
      const y = terrain.elevations[i];
      const slopeDeg = slope.slopeDeg[i];
      const g = Math.hypot(slope.gradientX[i], slope.gradientZ[i]);

      const canTerrace = slopeDeg <= params.maxSlopeDeg;
      buildable[i] = canTerrace ? 1 : 0;

      let factor = terraceBuildFactor(slopeDeg, params.maxSlopeDeg);
      if (params.edgeFadeCells > 0) {
        const edge = Math.min(x, z, terrain.cols - 1 - x, terrain.rows - 1 - z);
        factor *= smoothstep(0, params.edgeFadeCells, edge);
      }
      factor = clamp(factor, 0, 1);
      factorGrid[i] = factor;

      const rel = (y - base) / h;
      const q = Math.floor(rel);
      const f = rel - q;
      const benchId = Math.round(rel);
      benchIds[i] = canTerrace ? benchId : -1;
      if (canTerrace) {
        minBench = Math.min(minBench, benchId);
        maxBench = Math.max(maxBench, benchId);
      }

      // 对称相位剖面保证挖填在解析斜面上连续平衡。
      const ideal = terraceIdealFromElevation(y, g, params, base);

      designed[i] = y + (ideal - y) * factor;
      if (!canTerrace && factor === 0) designed[i] = y;
    }
  }

  // 正式挖填方表使用亚格子积分，窄坎不会被粗网格漏掉。
  const volumes = computeRefinedTerraceEarthwork(terrain, params, base, { targetResolution: 2048 });
  const benchCount = Number.isFinite(minBench) ? maxBench - minBench + 1 : 0;

  return {
    params: { ...params, baseElevation: base },
    designed,
    benchIds,
    buildable,
    factor: factorGrid,
    volumes,
    benchCount,
    generatedAt: Date.now()
  };
}

export function terracePhaseInfo(y: number, base: number, h: number) {
  const rel = (y - base) / h;
  return { index: Math.floor(rel), phase: rel - Math.floor(rel), benchId: Math.round(rel) };
}

export function newTerraceResultId() {
  return uid('terrace_result');
}
