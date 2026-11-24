import { generateHillTerrain, computeSlopeAspect } from '../src/lib/terrain.ts';
import { generateTerraces } from '../src/lib/terrace.ts';
import { generateTeaRows, createDefaultRowParams } from '../src/lib/rows.ts';

const started = performance.now();
const terrain = generateHillTerrain({ segments: 512, size: 300 });
const slope = computeSlopeAspect(terrain);
const t0 = performance.now();
const terrace = generateTerraces(terrain, slope, {
  riserHeight: 1.2,
  benchWidth: 3,
  maxSlopeDeg: 25,
  riserMaxAngleDeg: 68,
  reverseSlope: 0,
  edgeFadeCells: 0,
  baseElevation: null
});
const t1 = performance.now();
const rows = generateTeaRows(terrain, terrace, createDefaultRowParams());
const t2 = performance.now();
console.log({
  totalMs: Math.round(performance.now() - started),
  terraceMs: Math.round(t1 - t0),
  rowsMs: Math.round(t2 - t1),
  plants: rows.plants.length,
  rowSegments: rows.rows.length
});
