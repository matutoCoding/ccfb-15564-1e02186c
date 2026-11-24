export type ID = string;

export type PageKey =
  | 'projects'
  | 'terrain'
  | 'terrace'
  | 'rows'
  | 'season'
  | 'settings';

export interface TerrainGrid {
  id: ID;
  name: string;
  cols: number;
  rows: number;
  cellX: number;
  cellZ: number;
  originX: number;
  originZ: number;
  elevations: Float32Array;
  source: 'generated' | 'geotiff' | 'csv';
  minElev: number;
  maxElev: number;
  createdAt: number;
}

export interface SlopeGrid {
  slopeDeg: Float32Array;
  aspectRad: Float32Array;
  gradientX: Float32Array;
  gradientZ: Float32Array;
}

export interface TerraceParams {
  riserHeight: number;
  benchWidth: number;
  maxSlopeDeg: number;
  riserMaxAngleDeg: number;
  reverseSlope: number;
  edgeFadeCells: number;
  baseElevation: number | null;
}

export interface BenchVolume {
  benchId: number;
  label: string;
  cut: number;
  fill: number;
  net: number;
  area: number;
  cellCount: number;
  minElev: number;
  maxElev: number;
}

export interface EarthworkReport {
  cellArea: number;
  totalCut: number;
  totalFill: number;
  net: number;
  balanceError: number;
  balanceErrorPct: number;
  affectedArea: number;
  benches: BenchVolume[];
}

export interface TerraceResult {
  params: TerraceParams;
  designed: Float32Array;
  benchIds: Int32Array;
  buildable: Uint8Array;
  factor: Float32Array;
  volumes: EarthworkReport;
  benchCount: number;
  generatedAt: number;
}

export type VarietyKey = 'longjing43' | 'fuding' | 'tieguanyin' | 'custom';

export interface RowParams {
  variety: VarietyKey;
  rowSpacing: number;
  plantSpacing: number;
  edgeMargin: number;
  maxOffset: number;
  minPlantDistance: number;
}

export interface TeaPlant {
  x: number;
  y: number;
  z: number;
  rowId: number;
  benchId: number;
  scale: number;
  hueShift: number;
}

export interface TeaRow {
  id: number;
  benchId: number;
  subIndex: number;
  points: Float32Array;
  plantCount: number;
  length: number;
}

export interface RowResult {
  params: RowParams;
  rows: TeaRow[];
  plants: TeaPlant[];
  generatedAt: number;
}

export type LineKind = 'drain' | 'path';

export interface GuideLine {
  id: ID;
  kind: LineKind;
  name: string;
  points: Array<{ x: number; z: number }>;
  width: number;
  catchmentArea?: number;
}

export interface HydrologyResult {
  flowX: Float32Array;
  flowZ: Float32Array;
  accumulation: Float32Array;
  maxAccumulation: number;
  outlets: Array<{ x: number; z: number; area: number }>;
}

export interface ProfilePoint {
  distance: number;
  x: number;
  z: number;
  original: number;
  designed: number;
}

export interface ProfileLine {
  start: { x: number; z: number };
  end: { x: number; z: number };
  samples: ProfilePoint[];
  cut: number;
  fill: number;
}

export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonSettings {
  season: SeasonKey;
  fogEnabled: boolean;
  fogDensity: number;
  morningMist: number;
  sunAzimuth: number;
  sunHeight: number;
}

export interface ViewSettings {
  displayMode: 'realistic' | 'slope' | 'earthwork' | 'flow';
  showDesigned: boolean;
  showTerraceLines: boolean;
  showRows: boolean;
  showPlants: boolean;
  showGuides: boolean;
  showFlow: boolean;
  quality: 'low' | 'medium' | 'high';
}

export interface Project {
  id: ID;
  name: string;
  owner: string;
  location: string;
  areaMu: number;
  createdAt: number;
  updatedAt: number;
  terrain: TerrainGrid | null;
  slope: SlopeGrid | null;
  terraceParams: TerraceParams;
  terrace: TerraceResult | null;
  rowParams: RowParams;
  rows: RowResult | null;
  lines: GuideLine[];
  hydrology: HydrologyResult | null;
  profile: ProfileLine | null;
  season: SeasonSettings;
  view: ViewSettings;
}

export interface ProjectSummary {
  id: ID;
  name: string;
  owner: string;
  location: string;
  areaMu: number;
  createdAt: number;
  updatedAt: number;
  hasTerrain: boolean;
  plantCount: number;
}
