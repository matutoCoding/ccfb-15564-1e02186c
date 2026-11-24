import { generateHillTerrain, computeSlopeAspect } from '../src/lib/terrain.ts';
import { generateTerraces } from '../src/lib/terrace.ts';
import { generateTeaRows, createDefaultRowParams } from '../src/lib/rows.ts';
import { computeHydrology, autoGenerateGuides } from '../src/lib/hydrology.ts';
import { createProfileLine, defaultProfileEndpoints } from '../src/lib/profile.ts';

const terrain = generateHillTerrain({ segments: 160, size: 240 });
const slope = computeSlopeAspect(terrain);
const terrace = generateTerraces(terrain, slope, {
  riserHeight: 1.2,
  benchWidth: 3,
  maxSlopeDeg: 25,
  riserMaxAngleDeg: 68,
  reverseSlope: 0,
  edgeFadeCells: 0,
  baseElevation: null
});
const rows = generateTeaRows(terrain, terrace, createDefaultRowParams());
const hydro = computeHydrology(terrain);
const guides = autoGenerateGuides(terrain, slope, hydro, 4, 2);
const endpoints = defaultProfileEndpoints(terrain);
const profile = createProfileLine(terrain, terrace, endpoints.start, endpoints.end);

console.log({
  grid: [terrain.cols, terrain.rows],
  terraceBenches: terrace.benchCount,
  cut: Math.round(terrace.volumes.totalCut),
  fill: Math.round(terrace.volumes.totalFill),
  balancePct: terrace.volumes.balanceErrorPct.toFixed(3),
  rows: rows.rows.length,
  plants: rows.plants.length,
  hydroMax: Math.round(hydro.maxAccumulation),
  guides: guides.length,
  profileSamples: profile.samples.length
});

if (!rows.plants.length || !guides.length) process.exit(1);
