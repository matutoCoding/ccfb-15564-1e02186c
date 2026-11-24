import type {
  RowParams,
  RowResult,
  TeaPlant,
  TeaRow,
  TerraceResult,
  TerrainGrid,
  VarietyKey
} from '../types.ts';
import { sampleWorldGrid } from './math.ts';
import { extractContourPolylines } from './contours.ts';

export const VARIETY_PRESETS: Record<Exclude<VarietyKey, 'custom'>, { label: string; rowSpacing: number; plantSpacing: number }> = {
  longjing43: { label: '龙井 43', rowSpacing: 1.25, plantSpacing: 0.33 },
  fuding: { label: '福鼎大白', rowSpacing: 1.5, plantSpacing: 0.4 },
  tieguanyin: { label: '铁观音', rowSpacing: 1.6, plantSpacing: 0.5 }
};

export function createDefaultRowParams(): RowParams {
  return {
    variety: 'longjing43',
    rowSpacing: 1.25,
    plantSpacing: 0.33,
    edgeMargin: 0.38,
    maxOffset: 2.4,
    minPlantDistance: 0.24
  };
}

interface Vec2 { x: number; z: number }

function resampleClosedPath(points: Float32Array, spacing: number, closed: boolean): Vec2[] {
  const input: Vec2[] = [];
  for (let i = 0; i < points.length; i += 2) input.push({ x: points[i], z: points[i + 1] });
  if (input.length < 2) return [];

  if (closed) {
    const first = input[0];
    const last = input[input.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) input.pop();
  }

  const distances = [0];
  let total = 0;
  for (let i = 1; i < input.length; i++) {
    total += Math.hypot(input[i].x - input[i - 1].x, input[i].z - input[i - 1].z);
    distances.push(total);
  }
  if (closed) total += Math.hypot(input[0].x - input[input.length - 1].x, input[0].z - input[input.length - 1].z);
  if (total < spacing) return [];

  const sampleAt = (d: number): Vec2 => {
    if (closed && d >= distances[distances.length - 1] + 1e-9) {
      const tail = d - distances[distances.length - 1];
      const a = input[input.length - 1];
      const b = input[0];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const t = Math.min(1, tail / len);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    let idx = 1;
    while (idx < distances.length - 1 && distances[idx] < d) idx++;
    const span = distances[idx] - distances[idx - 1] || 1;
    const t = (d - distances[idx - 1]) / span;
    const a = input[idx - 1];
    const b = input[idx];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };

  const count = closed ? Math.floor(total / spacing) : Math.floor(total / spacing) + 1;
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) out.push(sampleAt(Math.min(total, i * spacing)));
  if (!closed) out.push(sampleAt(total));
  return out;
}

function radiusAt(points: Vec2[], i: number, step: number, closed: boolean): number {
  const n = points.length;
  const at = (delta: number) => {
    let idx = i + delta;
    if (closed) idx = (idx + n) % n;
    return points[Math.max(0, Math.min(n - 1, idx))];
  };
  const a = at(-step);
  const p = points[i];
  const b = at(step);
  const v1x = p.x - a.x;
  const v1z = p.z - a.z;
  const v2x = b.x - p.x;
  const v2z = b.z - p.z;
  const l1 = Math.hypot(v1x, v1z) || 1;
  const l2 = Math.hypot(v2x, v2z) || 1;
  const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
  const cross = (v1x * v2z - v1z * v2x) / (l1 * l2);
  const angle = Math.abs(Math.atan2(cross, dot));
  if (angle < 1e-4) return Infinity;
  return (l1 + l2) / 2 / angle;
}

export function generateTeaRows(
  terrain: TerrainGrid,
  terrace: TerraceResult,
  params: RowParams
): RowResult {
  const rows: TeaRow[] = [];
  const plants: TeaPlant[] = [];
  const occupancy = new Map<string, number[]>();
  const occCell = Math.max(0.12, params.minPlantDistance);

  const canPlace = (x: number, z: number): boolean => {
    const gx = Math.floor(x / occCell);
    const gz = Math.floor(z / occCell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = occupancy.get(`${gx + dx},${gz + dz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i += 2) {
          if (Math.hypot(list[i] - x, list[i + 1] - z) < params.minPlantDistance) return false;
        }
      }
    }
    const key = `${gx},${gz}`;
    if (!occupancy.has(key)) occupancy.set(key, []);
    occupancy.get(key)!.push(x, z);
    return true;
  };

  const validGround = (x: number, z: number, benchId: number): number | null => {
    const gx = Math.round((x - terrain.originX) / terrain.cellX);
    const gz = Math.round((z - terrain.originZ) / terrain.cellZ);
    if (gx < 1 || gx >= terrain.cols - 1 || gz < 1 || gz >= terrain.rows - 1) return null;
    const idx = gz * terrain.cols + gx;
    if (!terrace.buildable[idx] || terrace.benchIds[idx] !== benchId) return null;
    return sampleWorldGrid(
      terrace.designed,
      terrain.cols,
      terrain.rows,
      terrain.cellX,
      terrain.cellZ,
      terrain.originX,
      terrain.originZ,
      x,
      z
    );
  };

  const fineSpacing = Math.max(0.12, params.plantSpacing * 0.55);
  const available = Math.max(0.4, terrace.params.benchWidth - params.edgeMargin * 2);
  const offsetCount = Math.max(1, Math.min(5, Math.floor(available / params.rowSpacing) + 1));
  const offsets = Array.from({ length: offsetCount }, (_, j) => {
    if (offsetCount === 1) return 0;
    return (j - (offsetCount - 1) / 2) * params.rowSpacing;
  }).filter((o) => Math.abs(o) <= params.maxOffset && Math.abs(o) <= available * 0.5 + 0.01);

  const base = terrace.params.baseElevation ?? 0;
  const benchIds = terrace.volumes.benches.map((b) => b.benchId).filter((id) => id >= 0);
  const minBench = benchIds.length ? Math.min(...benchIds) : 0;
  const maxBench = benchIds.length ? Math.max(...benchIds) : -1;
  for (let benchId = minBench; benchId <= maxBench; benchId++) {
    if (!Number.isFinite(benchId)) break;
    const level = base + benchId * terrace.params.riserHeight;
    if (level < terrain.minElev || level > terrain.maxElev) continue;
    const contours = extractContourPolylines(terrain, level);

    for (const contour of contours) {
      const center = resampleClosedPath(contour.points, fineSpacing, contour.closed);
      if (center.length < 4) continue;
      const tangentStep = Math.max(2, Math.round(0.8 / fineSpacing));

      for (const offset of offsets) {
        let runPoints: number[] = [];
        let runPlants: TeaPlant[] = [];
        let accumDistance = 0;
        let lastX = 0;
        let lastZ = 0;

        const flush = () => {
          if (runPoints.length < 6 || runPlants.length === 0) {
            runPoints = [];
            runPlants = [];
            accumDistance = 0;
            return;
          }
          const id = rows.length + 1;
          for (const p of runPlants) p.rowId = id;
          let length = 0;
          for (let i = 3; i < runPoints.length; i += 3) {
            length += Math.hypot(runPoints[i] - runPoints[i - 3], runPoints[i + 2] - runPoints[i - 1]);
          }
          rows.push({
            id,
            benchId,
            subIndex: Math.round(offset * 100),
            points: new Float32Array(runPoints),
            plantCount: runPlants.length,
            length
          });
          plants.push(...runPlants);
          runPoints = [];
          runPlants = [];
          accumDistance = 0;
        };

        for (let i = 0; i < center.length; i++) {
          const prev = center[Math.max(0, i - 1)];
          const next = center[Math.min(center.length - 1, i + 1)];
          let tx = next.x - prev.x;
          let tz = next.z - prev.z;
          const tl = Math.hypot(tx, tz) || 1;
          tx /= tl;
          tz /= tl;
          const nx = -tz;
          const nz = tx;
          const radius = radiusAt(center, i, tangentStep, contour.closed);
          if (Math.abs(offset) > radius * 0.72) {
            flush();
            continue;
          }

          const x = center[i].x + nx * offset;
          const z = center[i].z + nz * offset;
          const y = validGround(x, z, benchId);
          if (y === null) {
            flush();
            continue;
          }

          if (runPoints.length >= 3) {
            accumDistance += Math.hypot(x - lastX, z - lastZ);
          }
          lastX = x;
          lastZ = z;
          runPoints.push(x, y + 0.08, z);

          if (runPlants.length === 0 || accumDistance >= params.plantSpacing) {
            if (canPlace(x, z)) {
              runPlants.push({
                x,
                y: y + 0.02,
                z,
                rowId: rows.length + 1,
                benchId,
                scale: 0.78 + (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 0.34),
                hueShift: Math.sin(x * 4.13 + z * 9.71) * 0.08
              });
              accumDistance = 0;
            }
          }
        }
        flush();
      }
    }
  }

  return { params: { ...params }, rows, plants, generatedAt: Date.now() };
}
