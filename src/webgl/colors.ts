import type { Project } from '../types.ts';
import { clamp } from '../lib/math.ts';

export type RGB = [number, number, number];

export function rampSlope(slopeDeg: number): RGB {
  if (slopeDeg <= 12) {
    const t = slopeDeg / 12;
    return [0.20 + t * 0.18, 0.43 + t * 0.12, 0.20];
  }
  if (slopeDeg <= 25) {
    const t = (slopeDeg - 12) / 13;
    return [0.78 + t * 0.12, 0.62 - t * 0.25, 0.18];
  }
  const t = clamp((slopeDeg - 25) / 20, 0, 1);
  return [0.72 + t * 0.12, 0.16 - t * 0.08, 0.12 + t * 0.05];
}

export function rampEarthwork(depth: number, scale = 2.5): RGB {
  const t = clamp(Math.abs(depth) / scale, 0, 1);
  if (depth > 0.02) return [0.95, 0.48 - t * 0.28, 0.16 - t * 0.1];
  if (depth < -0.02) return [0.18 + (1 - t) * 0.1, 0.45 + t * 0.2, 0.82];
  return [0.72, 0.68, 0.55];
}

export function terrainVertexColor(project: Project, index: number): RGB {
  const terrain = project.terrain!;
  const mode = project.view.displayMode;
  const slope = project.slope;
  const terrace = project.terrace;
  const y = terrain.elevations[index];
  const slopeDeg = slope?.slopeDeg[index] ?? 0;

  if (mode === 'slope' && slope) return rampSlope(slopeDeg);

  if (mode === 'earthwork' && terrace) {
    return rampEarthwork(y - terrace.designed[index]);
  }

  if (mode === 'flow' && project.hydrology) {
    const a = clamp(project.hydrology.accumulation[index] / Math.max(1, project.hydrology.maxAccumulation * 0.18), 0, 1);
    return [0.22 - a * 0.08, 0.38 + a * 0.18, 0.34 + a * 0.36];
  }

  if (terrace && terrace.buildable[index] && project.view.showDesigned) {
    const normalSlope = slopeDeg;
    const benchTone = (Math.sin(terrace.benchIds[index] * 1.713) * 0.5 + 0.5) * 0.05;
    if (normalSlope > 20) {
      return [0.47 + benchTone, 0.34 + benchTone * 0.5, 0.20];
    }
    return [0.20 + benchTone, 0.43 + benchTone * 1.4, 0.19 + benchTone];
  }

  const elevT = clamp((y - terrain.minElev) / Math.max(1, terrain.maxElev - terrain.minElev), 0, 1);
  const vegetation: RGB = [0.18 + elevT * 0.1, 0.36 + elevT * 0.12, 0.20 + elevT * 0.04];
  if (slopeDeg > project.terraceParams.maxSlopeDeg) return [0.72, 0.18, 0.13];
  return vegetation;
}

export function computeGridNormals(values: Float32Array, cols: number, rows: number, cellX: number, cellZ: number): Float32Array {
  const normals = new Float32Array(cols * rows * 3);
  for (let z = 0; z < rows; z++) {
    const z0 = Math.max(0, z - 1);
    const z1 = Math.min(rows - 1, z + 1);
    for (let x = 0; x < cols; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(cols - 1, x + 1);
      const i = z * cols + x;
      const gx = (values[z * cols + x1] - values[z * cols + x0]) / ((x1 - x0) * cellX);
      const gz = (values[z1 * cols + x] - values[z0 * cols + x]) / ((z1 - z0) * cellZ);
      const nx = -gx;
      const ny = 1;
      const nz = -gz;
      const l = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / l;
      normals[i * 3 + 1] = ny / l;
      normals[i * 3 + 2] = nz / l;
    }
  }
  return normals;
}
