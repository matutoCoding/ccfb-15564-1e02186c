import type { BenchVolume, EarthworkReport, TerraceParams, TerrainGrid } from '../types.ts';
import { clamp, smoothstep } from './math.ts';
import { terraceBuildFactor, terraceIdealFromElevation } from './terrace_profile.ts';

export interface RefineOptions {
  targetResolution?: number;
  maxSubdivisions?: number;
}

// 亚格子积分：在每个 DEM 格子内做双线性加密，避免窄坎被顶点采样漏掉。
export function computeRefinedTerraceEarthwork(
  terrain: TerrainGrid,
  params: TerraceParams,
  base: number,
  options: RefineOptions = {}
): EarthworkReport {
  const targetResolution = options.targetResolution ?? 2048;
  const maxSub = options.maxSubdivisions ?? 8;
  const cellsX = terrain.cols - 1;
  const cellsZ = terrain.rows - 1;
  const sub = Math.max(1, Math.min(maxSub, Math.ceil(targetResolution / Math.max(cellsX, cellsZ))));
  const subArea = terrain.cellX * terrain.cellZ / (sub * sub);
  const data = terrain.elevations;
  const map = new Map<number, BenchVolume>();

  let totalCut = 0;
  let totalFill = 0;
  let affectedArea = 0;

  const ensure = (id: number) => {
    let b = map.get(id);
    if (!b) {
      b = {
        benchId: id,
        label: id < 0 ? '未耕作/陡坡区' : `第 ${id + 1} 台块`,
        cut: 0,
        fill: 0,
        net: 0,
        area: 0,
        cellCount: 0,
        minElev: Infinity,
        maxElev: -Infinity
      };
      map.set(id, b);
    }
    return b;
  };

  for (let iz = 0; iz < cellsZ; iz++) {
    for (let ix = 0; ix < cellsX; ix++) {
      const i00 = iz * terrain.cols + ix;
      const i10 = i00 + 1;
      const i01 = i00 + terrain.cols;
      const i11 = i01 + 1;
      const y00 = data[i00];
      const y10 = data[i10];
      const y01 = data[i01];
      const y11 = data[i11];

      for (let sz = 0; sz < sub; sz++) {
        const v = (sz + 0.5) / sub;
        for (let sx = 0; sx < sub; sx++) {
          const u = (sx + 0.5) / sub;
          const w00 = (1 - u) * (1 - v);
          const w10 = u * (1 - v);
          const w01 = (1 - u) * v;
          const w11 = u * v;
          const y = y00 * w00 + y10 * w10 + y01 * w01 + y11 * w11;
          const gx = ((1 - v) * (y10 - y00) + v * (y11 - y01)) / terrain.cellX;
          const gz = ((1 - u) * (y01 - y00) + u * (y11 - y10)) / terrain.cellZ;
          const g = Math.hypot(gx, gz);
          const slopeDeg = Math.atan(g) * 180 / Math.PI;
          const canTerrace = slopeDeg <= params.maxSlopeDeg;

          let factor = terraceBuildFactor(slopeDeg, params.maxSlopeDeg);
          if (params.edgeFadeCells > 0) {
            const edge = Math.min(
              ix + u,
              iz + v,
              cellsX - ix - u,
              cellsZ - iz - v
            );
            factor *= smoothstep(0, params.edgeFadeCells, edge);
          }
          factor = clamp(factor, 0, 1);

          const ideal = terraceIdealFromElevation(y, g, params, base);
          const designed = y + (ideal - y) * factor;
          const depth = y - designed;
          const cut = depth > 0 ? depth * subArea : 0;
          const fill = depth < 0 ? -depth * subArea : 0;
          const id = canTerrace ? Math.round((y - base) / params.riserHeight) : -1;
          const bench = ensure(id);

          totalCut += cut;
          totalFill += fill;
          bench.cut += cut;
          bench.fill += fill;
          bench.area += subArea;
          if (cut + fill > 1e-10) affectedArea += subArea;
          if (designed < bench.minElev) bench.minElev = designed;
          if (designed > bench.maxElev) bench.maxElev = designed;
        }
      }
    }
  }

  const benches = [...map.values()].map((b) => {
    const cut = Math.abs(b.cut) < 1e-7 ? 0 : b.cut;
    const fill = Math.abs(b.fill) < 1e-7 ? 0 : b.fill;
    return {
      ...b,
      cut,
      fill,
      net: cut - fill,
      minElev: Number.isFinite(b.minElev) ? b.minElev : 0,
      maxElev: Number.isFinite(b.maxElev) ? b.maxElev : 0
    };
  }).sort((a, b) => a.benchId - b.benchId);

  const net = totalCut - totalFill;
  const denom = (totalCut + totalFill) * 0.5;
  return {
    cellArea: terrain.cellX * terrain.cellZ,
    totalCut,
    totalFill,
    net,
    balanceError: net,
    balanceErrorPct: denom > 1e-9 ? Math.abs(net) / denom * 100 : 0,
    affectedArea,
    benches
  };
}
