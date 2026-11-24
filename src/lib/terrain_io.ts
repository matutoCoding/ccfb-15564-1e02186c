import type { TerrainGrid } from '../types.ts';
import { createTerrainGrid } from './terrain.ts';

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0] ?? ',';
}

function parseMatrix(text: string): number[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) throw new Error('CSV 文件为空');
  const delimiter = detectDelimiter(lines[0]);
  const rows: number[][] = [];

  for (const line of lines) {
    const cells = line.split(delimiter).map((c) => c.trim());
    const nums = cells.map(Number);
    const numericCount = nums.filter((n) => Number.isFinite(n)).length;
    if (numericCount === 0) continue;
    // 首列可能是行号或地名。
    const firstNumeric = Number.isFinite(nums[0]) ? 0 : 1;
    const row = nums.slice(firstNumeric).map((n) => Number.isFinite(n) ? n : NaN);
    if (row.length) rows.push(row);
  }
  if (rows.length < 4) throw new Error('高程矩阵至少需要 4 行有效数据');
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? NaN));
}

function finishGrid(name: string, matrix: number[][], cellSize = 1): TerrainGrid {
  const rows = matrix.length;
  const cols = Math.max(...matrix.map((r) => r.length));
  const elevations = new Float32Array(cols * rows);
  const valid: number[] = [];
  let sum = 0;
  let count = 0;

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const v = matrix[z][x];
      if (Number.isFinite(v)) {
        elevations[z * cols + x] = v;
        valid.push(v);
        sum += v;
        count++;
      }
    }
  }
  if (!count) throw new Error('没有识别到有效高程数值');
  const fallback = sum / count;

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      if (!Number.isFinite(matrix[z][x])) elevations[z * cols + x] = fallback;
    }
  }

  return createTerrainGrid(name, cols, rows, cellSize, cellSize, elevations, 'csv');
}

interface XyzRecord { x: number; y: number; z: number }

function parseXyz(text: string): XyzRecord[] | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 4) return null;
  const delimiter = detectDelimiter(lines[0]);
  const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const ix = header.findIndex((h) => ['x', 'lon', 'longitude', '经度'].includes(h));
  const iy = header.findIndex((h) => ['y', 'lat', 'latitude', '纬度'].includes(h));
  const iz = header.findIndex((h) => ['z', 'elev', 'elevation', 'height', '高程', '海拔'].includes(h));
  if (ix < 0 || iy < 0 || iz < 0) return null;

  const records: XyzRecord[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(delimiter).map(Number);
    if ([c[ix], c[iy], c[iz]].every(Number.isFinite)) {
      records.push({ x: c[ix], y: c[iy], z: c[iz] });
    }
  }
  return records.length >= 4 ? records : null;
}

function xyzToGrid(name: string, records: XyzRecord[]): TerrainGrid {
  const xs = [...new Set(records.map((r) => r.x))].sort((a, b) => a - b);
  const ys = [...new Set(records.map((r) => r.y))].sort((a, b) => a - b);
  const regular = xs.length * ys.length === records.length;

  if (regular && xs.length > 3 && ys.length > 3) {
    const map = new Map(records.map((r) => [`${r.x},${r.y}`, r.z]));
    const data: number[][] = ys.map((y) => xs.map((x) => map.get(`${x},${y}`) ?? NaN));
    const cellX = medianDiff(xs) || 1;
    const cellZ = medianDiff(ys) || cellX;
    const grid = finishGrid(name, data, 1);
    grid.cellX = cellX;
    grid.cellZ = cellZ;
    grid.originX = -((xs.length - 1) * cellX) / 2;
    grid.originZ = -((ys.length - 1) * cellZ) / 2;
    return grid;
  }

  // 散点 CSV：反距离加权到 320 格预览地形。
  const segments = 320;
  const minX = Math.min(...records.map((r) => r.x));
  const maxX = Math.max(...records.map((r) => r.x));
  const minY = Math.min(...records.map((r) => r.y));
  const maxY = Math.max(...records.map((r) => r.y));
  const cellX = (maxX - minX) / segments || 1;
  const cellZ = (maxY - minY) / segments || 1;
  const data = new Float32Array((segments + 1) ** 2);
  for (let iz = 0; iz <= segments; iz++) {
    const y = minY + iz * cellZ;
    for (let ix = 0; ix <= segments; ix++) {
      const x = minX + ix * cellX;
      let weightSum = 0;
      let valueSum = 0;
      for (const r of records) {
        const d2 = (r.x - x) ** 2 + (r.y - y) ** 2 + 1e-6;
        const w = 1 / d2;
        weightSum += w;
        valueSum += w * r.z;
      }
      data[iz * (segments + 1) + ix] = valueSum / weightSum;
    }
  }
  const originX = -((segments) * cellX) / 2;
  const originZ = -((segments) * cellZ) / 2;
  return createTerrainGrid(name, segments + 1, segments + 1, cellX, cellZ, data, 'csv', originX, originZ);
}

function medianDiff(values: number[]): number {
  const diffs = values.slice(1).map((v, i) => v - values[i]).filter((v) => v > 0).sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] ?? 0;
}

export function parseElevationCsv(text: string, name = 'CSV 地形', cellSize?: number): TerrainGrid {
  const xyz = parseXyz(text);
  if (xyz) return xyzToGrid(name, xyz);
  const matrix = parseMatrix(text);
  return finishGrid(name, matrix, cellSize ?? 1);
}

export async function parseGeoTiffFile(file: File): Promise<TerrainGrid> {
  const { fromArrayBuffer } = await import('geotiff');
  const buffer = await file.arrayBuffer();
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const source = rasters[0] as unknown as ArrayLike<number>;
  const noData = image.getGDALNoData?.() ?? null;
  const geo = image.getGeoTransform?.() ?? [0, 1, 0, 0, 0, -1];
  const cellX = Math.abs(geo[1] || 1);
  const cellZ = Math.abs(geo[5] || geo[1] || 1);
  const elevations = new Float32Array(width * height);
  let validSum = 0;
  let validCount = 0;

  for (let i = 0; i < source.length; i++) {
    const v = source[i];
    if (Number.isFinite(v) && v !== noData) {
      elevations[i] = v;
      validSum += v;
      validCount++;
    } else {
      elevations[i] = NaN;
    }
  }
  if (!validCount) throw new Error('GeoTIFF 没有有效高程波段');
  const mean = validSum / validCount;
  for (let i = 0; i < elevations.length; i++) if (!Number.isFinite(elevations[i])) elevations[i] = mean;

  // GeoTIFF 第一行通常是北边界；翻转为 z 轴向南递增的右手坐标。
  const flipped = new Float32Array(width * height);
  for (let z = 0; z < height; z++) {
    const src = (height - 1 - z) * width;
    flipped.set(elevations.subarray(src, src + width), z * width);
  }
  // 测绘坐标可能是很大的投影坐标；三维渲染前平移到局部原点，避免 float32 抖动。
  // 当前导出的是以场地中心为原点的米制坐标。
  const originX = -((width - 1) * cellX) / 2;
  const originZ = -((height - 1) * cellZ) / 2;
  return createTerrainGrid(file.name.replace(/\.[^.]+$/, ''), width, height, cellX, cellZ, flipped, 'geotiff', originX, originZ);
}
