import type { GuideLine, HydrologyResult, LineKind, SlopeGrid, TerrainGrid } from '../types.ts';
import { sampleWorldGrid, uid } from './math.ts';

interface HeapItem {
  index: number;
  elev: number;
}

class MinHeap {
  items: HeapItem[] = [];
  get size() {
    return this.items.length;
  }
  push(item: HeapItem) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].elev <= item.elev) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = item;
  }
  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let next = i;
        if (l < this.items.length && this.items[l].elev < this.items[next].elev) next = l;
        if (r < this.items.length && this.items[r].elev < this.items[next].elev) next = r;
        if (next === i) break;
        [this.items[i], this.items[next]] = [this.items[next], this.items[i]];
        i = next;
      }
    }
    return top;
  }
}

// Priority-flood 填洼，父节点就是 D8 流向；逆序累加得到汇水面积。
export function computeHydrology(terrain: TerrainGrid): HydrologyResult {
  const { cols, rows, elevations, cellX, cellZ, originX, originZ } = terrain;
  const n = cols * rows;
  const flowX = new Float32Array(n);
  const flowZ = new Float32Array(n);
  const accumulation = new Float32Array(n);
  const visited = new Uint8Array(n);
  const heap = new MinHeap();
  const order: number[] = [];
  const cellArea = Math.abs(cellX * cellZ);

  for (let x = 0; x < cols; x++) {
    for (const z of [0, rows - 1]) {
      const i = z * cols + x;
      if (!visited[i]) {
        visited[i] = 1;
        heap.push({ index: i, elev: elevations[i] });
      }
    }
  }
  for (let z = 0; z < rows; z++) {
    for (const x of [0, cols - 1]) {
      const i = z * cols + x;
      if (!visited[i]) {
        visited[i] = 1;
        heap.push({ index: i, elev: elevations[i] });
      }
    }
  }

  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  while (heap.size) {
    const current = heap.pop()!;
    order.push(current.index);
    const cx = current.index % cols;
    const cz = Math.floor(current.index / cols);

    for (const [dx, dz] of neighbors) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= cols || nz < 0 || nz >= rows) continue;
      const ni = nz * cols + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      const filledElev = Math.max(elevations[ni], current.elev + 1e-4);
      const len = Math.hypot(dx, dz) || 1;
      flowX[ni] = -dx / len;
      flowZ[ni] = -dz / len;
      heap.push({ index: ni, elev: filledElev });
    }
  }

  accumulation.fill(cellArea);
  for (let oi = order.length - 1; oi >= 0; oi--) {
    const i = order[oi];
    const fx = flowX[i];
    const fz = flowZ[i];
    if (fx === 0 && fz === 0) continue;
    const x = i % cols;
    const z = Math.floor(i / cols);
    let tx = x;
    let tz = z;
    if (Math.abs(fx) > 0.1 && Math.abs(fz) > 0.1) {
      tx += fx > 0 ? 1 : -1;
      tz += fz > 0 ? 1 : -1;
    } else if (Math.abs(fx) > Math.abs(fz)) {
      tx += fx > 0 ? 1 : -1;
    } else {
      tz += fz > 0 ? 1 : -1;
    }
    if (tx < 0 || tx >= cols || tz < 0 || tz >= rows) continue;
    accumulation[tz * cols + tx] += accumulation[i];
  }

  let maxAccumulation = 0;
  const outletCandidates: Array<{ x: number; z: number; area: number }> = [];
  for (let x = 0; x < cols; x++) {
    for (const z of [rows - 1, 0]) {
      const i = z * cols + x;
      maxAccumulation = Math.max(maxAccumulation, accumulation[i]);
      if (accumulation[i] > cellArea * 20) {
        outletCandidates.push({ x: originX + x * cellX, z: originZ + z * cellZ, area: accumulation[i] });
      }
    }
  }
  for (let z = 0; z < rows; z++) {
    for (const x of [0, cols - 1]) {
      const i = z * cols + x;
      maxAccumulation = Math.max(maxAccumulation, accumulation[i]);
      if (accumulation[i] > cellArea * 20) {
        outletCandidates.push({ x: originX + x * cellX, z: originZ + z * cellZ, area: accumulation[i] });
      }
    }
  }

  const outlets = outletCandidates
    .sort((a, b) => b.area - a.area)
    .filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) > terrain.cellX * 4)
    .slice(0, 12);

  return { flowX, flowZ, accumulation, maxAccumulation, outlets };
}

export function traceMaxSlope(
  terrain: TerrainGrid,
  slope: SlopeGrid,
  startX: number,
  startZ: number,
  maxSteps = 420
): Array<{ x: number; z: number }> {
  const points = [{ x: startX, z: startZ }];
  let x = startX;
  let z = startZ;
  const step = Math.max(terrain.cellX, terrain.cellZ) * 1.4;

  for (let i = 0; i < maxSteps; i++) {
    const gx = sampleWorldGrid(slope.gradientX, terrain.cols, terrain.rows, terrain.cellX, terrain.cellZ, terrain.originX, terrain.originZ, x, z);
    const gz = sampleWorldGrid(slope.gradientZ, terrain.cols, terrain.rows, terrain.cellX, terrain.cellZ, terrain.originX, terrain.originZ, x, z);
    const mag = Math.hypot(gx, gz);
    if (mag < 0.03) break;
    x += (-gx / mag) * step;
    z += (-gz / mag) * step;
    if (
      x < terrain.originX || x > terrain.originX + (terrain.cols - 1) * terrain.cellX ||
      z < terrain.originZ || z > terrain.originZ + (terrain.rows - 1) * terrain.cellZ
    ) {
      points.push({ x, z });
      break;
    }
    points.push({ x, z });
  }
  return points;
}

export function autoGenerateGuides(
  terrain: TerrainGrid,
  slope: SlopeGrid,
  hydrology: HydrologyResult,
  drainCount = 6,
  pathCount = 3
): GuideLine[] {
  let peak = -Infinity;
  let peakIndex = 0;
  for (let i = 0; i < terrain.elevations.length; i++) {
    if (terrain.elevations[i] > peak) {
      peak = terrain.elevations[i];
      peakIndex = i;
    }
  }
  const peakX = terrain.originX + (peakIndex % terrain.cols) * terrain.cellX;
  const peakZ = terrain.originZ + Math.floor(peakIndex / terrain.cols) * terrain.cellZ;
  const radius = Math.min((terrain.cols * terrain.cellX), (terrain.rows * terrain.cellZ)) * 0.13;
  const lines: GuideLine[] = [];

  const make = (kind: LineKind, count: number, angleOffset: number, width: number) => {
    for (let i = 0; i < count; i++) {
      const angle = angleOffset + (i / count) * Math.PI * 2;
      const sx = peakX + Math.cos(angle) * radius;
      const sz = peakZ + Math.sin(angle) * radius;
      const traced = traceMaxSlope(terrain, slope, sx, sz);
      if (traced.length < 5) continue;
      const end = traced[traced.length - 1];
      const gx = Math.round((end.x - terrain.originX) / terrain.cellX);
      const gz = Math.round((end.z - terrain.originZ) / terrain.cellZ);
      const area = gx >= 0 && gx < terrain.cols && gz >= 0 && gz < terrain.rows
        ? hydrology.accumulation[gz * terrain.cols + gx]
        : 0;
      lines.push({
        id: uid(kind),
        kind,
        name: kind === 'drain' ? `排水沟 ${lines.filter((l) => l.kind === 'drain').length + 1}` : `步道 ${lines.filter((l) => l.kind === 'path').length + 1}`,
        points: traced,
        width,
        catchmentArea: kind === 'drain' ? area : undefined
      });
    }
  };

  make('drain', drainCount, 0.2, 0.8);
  make('path', pathCount, Math.PI / pathCount, 1.5);
  return lines;
}
