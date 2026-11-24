import type { TerrainGrid } from '../types.ts';

export interface ContourSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface ContourPolyline {
  points: Float32Array;
  closed: boolean;
  level: number;
}

export function extractContourSegments(terrain: TerrainGrid, level: number): ContourSegment[] {
  const { cols, rows, elevations, cellX, cellZ, originX, originZ } = terrain;
  const segments: ContourSegment[] = [];

  const point = (edge: number, ix: number, iz: number) => {
    const i00 = iz * cols + ix;
    if (edge === 0) {
      const t = (level - elevations[i00]) / (elevations[i00 + 1] - elevations[i00] || 1e-12);
      return {
        x: originX + (ix + t) * cellX,
        z: originZ + iz * cellZ
      };
    }
    if (edge === 1) {
      const t = (level - elevations[i00 + 1]) / (elevations[i00 + cols + 1] - elevations[i00 + 1] || 1e-12);
      return {
        x: originX + (ix + 1) * cellX,
        z: originZ + (iz + t) * cellZ
      };
    }
    if (edge === 2) {
      const t = (level - elevations[i00 + cols]) / (elevations[i00 + cols + 1] - elevations[i00 + cols] || 1e-12);
      return {
        x: originX + (ix + t) * cellX,
        z: originZ + (iz + 1) * cellZ
      };
    }
    const t = (level - elevations[i00]) / (elevations[i00 + cols] - elevations[i00] || 1e-12);
    return {
      x: originX + ix * cellX,
      z: originZ + (iz + t) * cellZ
    };
  };

  const push = (e1: number, e2: number, ix: number, iz: number) => {
    const a = point(e1, ix, iz);
    const b = point(e2, ix, iz);
    segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
  };

  for (let iz = 0; iz < rows - 1; iz++) {
    for (let ix = 0; ix < cols - 1; ix++) {
      const i = iz * cols + ix;
      const v0 = elevations[i] - level;
      const v1 = elevations[i + 1] - level;
      const v2 = elevations[i + cols + 1] - level;
      const v3 = elevations[i + cols] - level;
      const index = (v0 >= 0 ? 1 : 0) | (v1 >= 0 ? 2 : 0) | (v2 >= 0 ? 4 : 0) | (v3 >= 0 ? 8 : 0);

      switch (index) {
        case 1: case 14: push(3, 0, ix, iz); break;
        case 2: case 13: push(0, 1, ix, iz); break;
        case 3: case 12: push(3, 1, ix, iz); break;
        case 4: case 11: push(1, 2, ix, iz); break;
        case 6: case 9: push(0, 2, ix, iz); break;
        case 7: case 8: push(3, 2, ix, iz); break;
        case 5:
          push(3, 0, ix, iz);
          push(1, 2, ix, iz);
          break;
        case 10:
          push(0, 1, ix, iz);
          push(2, 3, ix, iz);
          break;
        default:
          break;
      }
    }
  }
  return segments;
}

const keyOf = (x: number, z: number) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;

export function stitchContours(segments: ContourSegment[], level: number): ContourPolyline[] {
  const adjacency = new Map<string, number[]>();
  const coords = new Map<string, { x: number; z: number }>();
  const used = new Uint8Array(segments.length);

  segments.forEach((s, id) => {
    const ka = keyOf(s.ax, s.az);
    const kb = keyOf(s.bx, s.bz);
    coords.set(ka, { x: s.ax, z: s.az });
    coords.set(kb, { x: s.bx, z: s.bz });
    if (!adjacency.has(ka)) adjacency.set(ka, []);
    if (!adjacency.has(kb)) adjacency.set(kb, []);
    adjacency.get(ka)!.push(id);
    adjacency.get(kb)!.push(id);
  });

  const result: ContourPolyline[] = [];

  for (let firstId = 0; firstId < segments.length; firstId++) {
    if (used[firstId]) continue;
    const first = segments[firstId];
    const sequence: string[] = [keyOf(first.ax, first.az), keyOf(first.bx, first.bz)];
    used[firstId] = 1;

    let currentKey = sequence[sequence.length - 1];
    while (true) {
      const nextId = (adjacency.get(currentKey) ?? []).find((id) => !used[id]);
      if (nextId === undefined) break;
      used[nextId] = 1;
      const s = segments[nextId];
      const ka = keyOf(s.ax, s.az);
      const kb = keyOf(s.bx, s.bz);
      currentKey = ka === currentKey ? kb : ka;
      sequence.push(currentKey);
    }

    currentKey = sequence[0];
    while (true) {
      const nextId = (adjacency.get(currentKey) ?? []).find((id) => !used[id]);
      if (nextId === undefined) break;
      used[nextId] = 1;
      const s = segments[nextId];
      const ka = keyOf(s.ax, s.az);
      const kb = keyOf(s.bx, s.bz);
      currentKey = ka === currentKey ? kb : ka;
      sequence.unshift(currentKey);
    }

    if (sequence.length < 3) continue;
    const points = new Float32Array(sequence.length * 2);
    let closed = sequence[0] === sequence[sequence.length - 1];
    sequence.forEach((key, i) => {
      const p = coords.get(key)!;
      points[i * 2] = p.x;
      points[i * 2 + 1] = p.z;
    });
    if (closed && points.length >= 4) {
      // 保留首尾同点，重采样时按闭合处理。
    }
    result.push({ points, closed, level });
  }

  return result;
}

export function extractContourPolylines(terrain: TerrainGrid, level: number): ContourPolyline[] {
  return stitchContours(extractContourSegments(terrain, level), level);
}
