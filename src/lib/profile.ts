import type { ProfileLine, ProfilePoint, TerraceResult, TerrainGrid } from '../types.ts';
import { sampleWorldGrid } from './math.ts';

export function createProfileLine(
  terrain: TerrainGrid,
  terrace: TerraceResult | null,
  start: { x: number; z: number },
  end: { x: number; z: number },
  sampleCount = 240
): ProfileLine {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const total = Math.hypot(dx, dz);
  const samples: ProfilePoint[] = [];
  let cut = 0;
  let fill = 0;

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const x = start.x + dx * t;
    const z = start.z + dz * t;
    const original = sampleWorldGrid(
      terrain.elevations, terrain.cols, terrain.rows,
      terrain.cellX, terrain.cellZ, terrain.originX, terrain.originZ, x, z
    );
    const designed = terrace
      ? sampleWorldGrid(
        terrace.designed, terrain.cols, terrain.rows,
        terrain.cellX, terrain.cellZ, terrain.originX, terrain.originZ, x, z
      )
      : original;
    const distance = total * t;
    samples.push({ distance, x, z, original, designed });

    if (i > 0) {
      const prev = samples[i - 1];
      const segLen = Math.hypot(x - prev.x, z - prev.z);
      const d0 = prev.original - prev.designed;
      const d1 = original - designed;
      const avgD = (d0 + d1) * 0.5;
      if (avgD > 0) cut += avgD * segLen * 1; // 断面面积 m²，体积需乘扫描宽度。
      else fill += -avgD * segLen;
    }
  }

  return { start, end, samples, cut, fill };
}

export function defaultProfileEndpoints(terrain: TerrainGrid) {
  const width = (terrain.cols - 1) * terrain.cellX;
  const depth = (terrain.rows - 1) * terrain.cellZ;
  return {
    start: { x: terrain.originX + width * 0.18, z: terrain.originZ + depth * 0.5 },
    end: { x: terrain.originX + width * 0.82, z: terrain.originZ + depth * 0.5 }
  };
}
