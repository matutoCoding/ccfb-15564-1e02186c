import type { SlopeGrid, TerrainGrid } from '../types.ts';
import { clamp, fbm, uid } from './math.ts';

export interface GenerateTerrainOptions {
  name?: string;
  segments?: number;
  size?: number;
  seed?: number;
  peakHeight?: number;
}

export function createTerrainGrid(
  name: string,
  cols: number,
  rows: number,
  cellX: number,
  cellZ: number,
  elevations: Float32Array,
  source: TerrainGrid['source'],
  originX = -(cols - 1) * cellX * 0.5,
  originZ = -(rows - 1) * cellZ * 0.5
): TerrainGrid {
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i];
    if (v < minElev) minElev = v;
    if (v > maxElev) maxElev = v;
  }
  return {
    id: uid('terrain'),
    name,
    cols,
    rows,
    cellX,
    cellZ,
    originX,
    originZ,
    elevations,
    source,
    minElev,
    maxElev,
    createdAt: Date.now()
  };
}

export function generateHillTerrain(options: GenerateTerrainOptions = {}): TerrainGrid {
  const segments = options.segments ?? 512;
  const cols = segments + 1;
  const rows = segments + 1;
  const size = options.size ?? 300;
  const cell = size / segments;
  const seed = options.seed ?? 20261125;
  const peakHeight = options.peakHeight ?? 62;
  const elevations = new Float32Array(cols * rows);

  const cx = size * (0.08 + ((seed % 17) - 8) * 0.006);
  const cz = size * (-0.04 + ((seed % 11) - 5) * 0.008);
  const ridgeAngle = -0.55 + (seed % 7) * 0.11;
  const ca = Math.cos(ridgeAngle);
  const sa = Math.sin(ridgeAngle);

  for (let iz = 0; iz < rows; iz++) {
    const wz = -size * 0.5 + iz * cell;
    for (let ix = 0; ix < cols; ix++) {
      const wx = -size * 0.5 + ix * cell;
      const dx = wx - cx;
      const dz = wz - cz;
      const radial = Math.sqrt(dx * dx + dz * dz);
      const r = radial / (size * 0.43);

      const cone = peakHeight * 0.72 * Math.pow(Math.max(0, 1 - r), 1.18);
      const u = dx * ca + dz * sa;
      const v = -dx * sa + dz * ca;
      const ridge = peakHeight * 0.34 *
        Math.exp(-(v * v) / (2 * size * size * 0.012)) *
        Math.exp(-(u * u) / (2 * size * size * 0.16));

      const gullyAxis1 = Math.abs(dx * 0.72 - dz * 0.69 + size * 0.08);
      const gully1 = -9.5 * Math.exp(-(gullyAxis1 * gullyAxis1) / (2 * 7 * 7)) *
        smoothBand(radial / size, 0.08, 0.52);
      const gullyAxis2 = Math.abs(dx * -0.38 - dz * 0.925 - size * 0.02);
      const gully2 = -7.5 * Math.exp(-(gullyAxis2 * gullyAxis2) / (2 * 5.5 * 5.5)) *
        smoothBand(radial / size, 0.12, 0.5);

      const broad = 7 + 5 * Math.exp(-((wx * wx + wz * wz) / (2 * size * size * 0.55)));
      const n = (fbm(wx * 0.018 + seed * 0.013, wz * 0.018 - seed * 0.017, 5) - 0.5) * 7.5;
      const detail = (fbm(wx * 0.075 + 31, wz * 0.075 - 17, 3) - 0.5) * 1.8;

      elevations[iz * cols + ix] = Math.max(1.5, broad + cone + ridge + gully1 + gully2 + n + detail);
    }
  }

  return createTerrainGrid(options.name ?? '云脊生成山头', cols, rows, cell, cell, elevations, 'generated');
}

function smoothBand(v: number, inner: number, outer: number): number {
  if (v <= inner || v >= outer) return 0;
  const t = (v - inner) / (outer - inner);
  return Math.sin(Math.PI * clamp(t, 0, 1));
}

export function computeSlopeAspect(terrain: TerrainGrid): SlopeGrid {
  const { cols, rows, elevations, cellX, cellZ } = terrain;
  const slopeDeg = new Float32Array(cols * rows);
  const aspectRad = new Float32Array(cols * rows);
  const gradientX = new Float32Array(cols * rows);
  const gradientZ = new Float32Array(cols * rows);

  for (let z = 0; z < rows; z++) {
    const z0 = Math.max(0, z - 1);
    const z1 = Math.min(rows - 1, z + 1);
    const dzDen = (z1 - z0) * cellZ;
    for (let x = 0; x < cols; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(cols - 1, x + 1);
      const dxDen = (x1 - x0) * cellX;
      const gx = (elevations[z * cols + x1] - elevations[z * cols + x0]) / dxDen;
      const gz = (elevations[z1 * cols + x] - elevations[z0 * cols + x]) / dzDen;
      const i = z * cols + x;
      gradientX[i] = gx;
      gradientZ[i] = gz;
      const mag = Math.hypot(gx, gz);
      slopeDeg[i] = Math.atan(mag) * 180 / Math.PI;
      aspectRad[i] = mag < 1e-8 ? 0 : Math.atan2(-gz / mag, -gx / mag);
    }
  }
  return { slopeDeg, aspectRad, gradientX, gradientZ };
}

export function terrainWorldPoint(t: TerrainGrid, ix: number, iz: number) {
  return {
    x: t.originX + ix * t.cellX,
    z: t.originZ + iz * t.cellZ,
    y: t.elevations[iz * t.cols + ix]
  };
}

export function worldToGrid(t: TerrainGrid, x: number, z: number) {
  return {
    x: (x - t.originX) / t.cellX,
    z: (z - t.originZ) / t.cellZ
  };
}
