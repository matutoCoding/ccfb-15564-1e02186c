import type { Project } from '../types.ts';
import { computeGridNormals, terrainVertexColor } from './colors.ts';
import { sampleWorldGrid } from '../lib/math.ts';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface LineData {
  positions: number[];
  colors: number[];
}

export function qualityStride(project: Project): number {
  if (project.view.quality === 'low') return 4;
  if (project.view.quality === 'medium') return 2;
  return 1;
}

export function buildTerrainMesh(project: Project): MeshData | null {
  const terrain = project.terrain;
  if (!terrain) return null;
  const fullCols = terrain.cols;
  const fullRows = terrain.rows;
  const stride = qualityStride(project);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let x = 0; x < fullCols; x += stride) xs.push(x);
  if (xs[xs.length - 1] !== fullCols - 1) xs.push(fullCols - 1);
  for (let z = 0; z < fullRows; z += stride) zs.push(z);
  if (zs[zs.length - 1] !== fullRows - 1) zs.push(fullRows - 1);

  const cols = xs.length;
  const rows = zs.length;
  const source = project.view.showDesigned && project.terrace ? project.terrace.designed : terrain.elevations;
  const values = new Float32Array(cols * rows);
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);

  for (let iz = 0; iz < rows; iz++) {
    const fullZ = zs[iz];
    for (let ix = 0; ix < cols; ix++) {
      const fullX = xs[ix];
      const fullIndex = fullZ * fullCols + fullX;
      const outIndex = iz * cols + ix;
      const y = source[fullIndex];
      values[outIndex] = y;
      positions[outIndex * 3] = terrain.originX + fullX * terrain.cellX;
      positions[outIndex * 3 + 1] = y;
      positions[outIndex * 3 + 2] = terrain.originZ + fullZ * terrain.cellZ;
      const c = terrainVertexColor(project, fullIndex);
      colors[outIndex * 3] = c[0];
      colors[outIndex * 3 + 1] = c[1];
      colors[outIndex * 3 + 2] = c[2];
    }
  }

  const normals = computeGridNormals(values, cols, rows, terrain.cellX * stride, terrain.cellZ * stride);
  const indexCount = (cols - 1) * (rows - 1) * 6;
  const indices = new Uint32Array(indexCount);
  let k = 0;
  for (let z = 0; z < rows - 1; z++) {
    for (let x = 0; x < cols - 1; x++) {
      const a = z * cols + x;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = d;
      indices[k++] = a; indices[k++] = d; indices[k++] = b;
    }
  }
  return { positions, normals, colors, indices };
}

function addSegment(data: LineData, a: number[], b: number[], color: [number, number, number, number]) {
  data.positions.push(...a, ...b);
  data.colors.push(...color, ...color);
}

export function buildLineData(project: Project): LineData {
  const data: LineData = { positions: [], colors: [] };
  const terrain = project.terrain;
  if (!terrain) return data;
  const terrace = project.terrace;

  if (project.view.showTerraceLines && terrace) {
    const color: [number, number, number, number] = [0.20, 0.13, 0.07, 0.95];
    for (let z = 0; z < terrain.rows; z++) {
      for (let x = 0; x < terrain.cols - 1; x++) {
        const i = z * terrain.cols + x;
        if (terrace.benchIds[i] !== terrace.benchIds[i + 1] && terrace.benchIds[i] >= 0 && terrace.benchIds[i + 1] >= 0) {
          addSegment(data,
            [terrain.originX + x * terrain.cellX, terrace.designed[i] + 0.16, terrain.originZ + z * terrain.cellZ],
            [terrain.originX + (x + 1) * terrain.cellX, terrace.designed[i + 1] + 0.16, terrain.originZ + z * terrain.cellZ],
            color
          );
        }
      }
    }
    for (let x = 0; x < terrain.cols; x++) {
      for (let z = 0; z < terrain.rows - 1; z++) {
        const i = z * terrain.cols + x;
        const j = i + terrain.cols;
        if (terrace.benchIds[i] !== terrace.benchIds[j] && terrace.benchIds[i] >= 0 && terrace.benchIds[j] >= 0) {
          addSegment(data,
            [terrain.originX + x * terrain.cellX, terrace.designed[i] + 0.16, terrain.originZ + z * terrain.cellZ],
            [terrain.originX + x * terrain.cellX, terrace.designed[j] + 0.16, terrain.originZ + (z + 1) * terrain.cellZ],
            color
          );
        }
      }
    }
  }

  if (project.view.showRows && project.rows) {
    const color: [number, number, number, number] = [0.72, 0.92, 0.42, 0.9];
    for (const row of project.rows.rows) {
      const p = row.points;
      for (let i = 3; i < p.length; i += 3) {
        addSegment(data, [p[i - 3], p[i - 2] + 0.05, p[i - 1]], [p[i], p[i + 1] + 0.05, p[i + 2]], color);
      }
    }
  }

  if (project.view.showGuides) {
    for (const line of project.lines) {
      const color: [number, number, number, number] = line.kind === 'drain'
        ? [0.16, 0.55, 1, 1]
        : [0.95, 0.72, 0.32, 1];
      for (let i = 1; i < line.points.length; i++) {
        const a = line.points[i - 1];
        const b = line.points[i];
        addSegment(data,
          [a.x, sampleProjectHeight(project, a.x, a.z) + 0.35, a.z],
          [b.x, sampleProjectHeight(project, b.x, b.z) + 0.35, b.z],
          color
        );
      }
    }
  }

  if (project.profile) {
    const color: [number, number, number, number] = [1, 0.76, 0.16, 1];
    const s = project.profile.samples;
    for (let i = 1; i < s.length; i++) {
      addSegment(data, [s[i - 1].x, s[i - 1].designed + 1.2, s[i - 1].z], [s[i].x, s[i].designed + 1.2, s[i].z], color);
    }
  }

  if (project.view.showFlow && project.hydrology) {
    const step = Math.max(6, Math.floor(Math.min(terrain.cols, terrain.rows) / 90));
    const h = project.hydrology;
    for (let z = step; z < terrain.rows - step; z += step) {
      for (let x = step; x < terrain.cols - step; x += step) {
        const i = z * terrain.cols + x;
        const accumulation = h.accumulation[i];
        if (accumulation < terrain.cellX * terrain.cellZ * 80) continue;
        const px = terrain.originX + x * terrain.cellX;
        const pz = terrain.originZ + z * terrain.cellZ;
        const py = (project.view.showDesigned && terrace ? terrace.designed[i] : terrain.elevations[i]) + 0.5;
        const len = Math.min(7, 2.2 + Math.log10(accumulation + 1) * 0.6);
        const ex = px + h.flowX[i] * len;
        const ez = pz + h.flowZ[i] * len;
        const alpha = clamp(0.25 + accumulation / h.maxAccumulation * 0.65, 0.25, 0.95);
        const col: [number, number, number, number] = [0.35, 0.72, 1, alpha];
        addSegment(data, [px, py, pz], [ex, py, ez], col);
        const bx = ex - h.flowX[i] * len * 0.35;
        const bz = ez - h.flowZ[i] * len * 0.35;
        const px1 = bx + (-h.flowZ[i]) * len * 0.18;
        const pz1 = bz + h.flowX[i] * len * 0.18;
        const px2 = bx - (-h.flowZ[i]) * len * 0.18;
        const pz2 = bz - h.flowX[i] * len * 0.18;
        addSegment(data, [ex, py, ez], [px1, py, pz1], col);
        addSegment(data, [ex, py, ez], [px2, py, pz2], col);
      }
    }
  }

  return data;
}

export function sampleProjectHeight(project: Project, x: number, z: number): number {
  const t = project.terrain;
  if (!t) return 0;
  const data = project.view.showDesigned && project.terrace ? project.terrace.designed : t.elevations;
  return sampleWorldGrid(data, t.cols, t.rows, t.cellX, t.cellZ, t.originX, t.originZ, x, z);
}
