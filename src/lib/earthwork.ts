import type { BenchVolume, EarthworkReport, TerrainGrid } from '../types.ts';

interface TriangleVolume {
  cut: number;
  fill: number;
}

// 深度 d = 原始地面高程 - 设计地面高程；d>0 表示需要挖方。
export function triangleCutFill(
  area: number,
  d0: number,
  d1: number,
  d2: number
): TriangleVolume {
  const eps = 1e-10;
  const all = [d0, d1, d2];
  const positive = all.filter((d) => d > eps).length;
  const signed = area * (d0 + d1 + d2) / 3;

  if (positive === 0) {
    return { cut: 0, fill: Math.max(0, -signed) };
  }
  if (positive === 3) {
    return { cut: Math.max(0, signed), fill: 0 };
  }

  if (positive === 1) {
    const pi = all.findIndex((d) => d > eps);
    const dp = all[pi];
    const negatives = all.filter((d) => d <= eps);
    const t1 = dp / (dp - negatives[0]);
    const t2 = dp / (dp - negatives[1]);
    const cut = area * t1 * t2 * dp / 3;
    return { cut, fill: Math.max(0, cut - signed) };
  }

  const ni = all.findIndex((d) => d <= eps);
  const dn = all[ni];
  const positives = all.filter((d) => d > eps);
  const t1 = dn / (dn - positives[0]);
  const t2 = dn / (dn - positives[1]);
  const fill = area * t1 * t2 * (-dn) / 3;
  return { cut: Math.max(0, signed + fill), fill };
}

export function computeEarthwork(
  terrain: TerrainGrid,
  designed: Float32Array,
  benchIds?: Int32Array
): EarthworkReport {
  const { cols, rows, cellX, cellZ, elevations } = terrain;
  const cellArea = Math.abs(cellX * cellZ);
  const halfCellArea = cellArea * 0.5;
  const benchMap = new Map<number, BenchVolume>();

  let totalCut = 0;
  let totalFill = 0;
  let affectedArea = 0;

  const ensureBench = (id: number): BenchVolume => {
    let bench = benchMap.get(id);
    if (!bench) {
      bench = {
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
      benchMap.set(id, bench);
    }
    return bench;
  };

  const addTriangle = (id: number, a: number, b: number, c: number) => {
    const d0 = elevations[a] - designed[a];
    const d1 = elevations[b] - designed[b];
    const d2 = elevations[c] - designed[c];
    const v = triangleCutFill(halfCellArea, d0, d1, d2);
    totalCut += v.cut;
    totalFill += v.fill;
    if (v.cut + v.fill > 1e-8) affectedArea += halfCellArea;

    const bench = ensureBench(id);
    bench.cut += v.cut;
    bench.fill += v.fill;
    bench.area += halfCellArea;
  };

  for (let z = 0; z < rows - 1; z++) {
    for (let x = 0; x < cols - 1; x++) {
      const i00 = z * cols + x;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      const id = benchIds ? benchIds[i00] : 0;
      // 与渲染网格保持同一条对角线。
      addTriangle(id, i00, i01, i11);
      addTriangle(id, i00, i11, i10);

      const bench = ensureBench(id);
      bench.cellCount++;
      const h = designed[i00];
      if (h < bench.minElev) bench.minElev = h;
      if (h > bench.maxElev) bench.maxElev = h;
    }
  }

  const benches = [...benchMap.values()]
    .map((b) => ({
      ...b,
      cut: cleanVolume(b.cut),
      fill: cleanVolume(b.fill),
      net: cleanVolume(b.cut - b.fill),
      area: Math.abs(b.area),
      minElev: Number.isFinite(b.minElev) ? b.minElev : 0,
      maxElev: Number.isFinite(b.maxElev) ? b.maxElev : 0
    }))
    .sort((a, b) => a.benchId - b.benchId);

  totalCut = cleanVolume(totalCut);
  totalFill = cleanVolume(totalFill);
  const net = cleanVolume(totalCut - totalFill);
  const denom = (totalCut + totalFill) * 0.5;
  const balanceErrorPct = denom > 1e-9 ? Math.abs(net) / denom * 100 : 0;

  return {
    cellArea,
    totalCut,
    totalFill,
    net,
    balanceError: net,
    balanceErrorPct,
    affectedArea,
    benches
  };
}

function cleanVolume(v: number): number {
  return Math.abs(v) < 1e-7 ? 0 : v;
}
