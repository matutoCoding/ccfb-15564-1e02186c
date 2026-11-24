import type { Project } from '../types.ts';
import { uid } from './math.ts';
import { createDefaultTerraceParams } from './terrace.ts';
import { createDefaultRowParams } from './rows.ts';

export function createProject(input?: Partial<Pick<Project, 'name' | 'owner' | 'location' | 'areaMu'>>): Project {
  const now = Date.now();
  return {
    id: uid('proj'),
    name: input?.name?.trim() || '未命名山地茶园',
    owner: input?.owner?.trim() || '茶园规划组',
    location: input?.location?.trim() || '待填写茶山位置',
    areaMu: input?.areaMu ?? 0,
    createdAt: now,
    updatedAt: now,
    terrain: null,
    slope: null,
    terraceParams: createDefaultTerraceParams(),
    terrace: null,
    rowParams: createDefaultRowParams(),
    rows: null,
    lines: [],
    hydrology: null,
    profile: null,
    season: {
      season: 'spring',
      fogEnabled: true,
      fogDensity: 0.0065,
      morningMist: 0.45,
      sunAzimuth: 135,
      sunHeight: 42
    },
    view: {
      displayMode: 'realistic',
      showDesigned: true,
      showTerraceLines: true,
      showRows: true,
      showPlants: true,
      showGuides: true,
      showFlow: false,
      quality: 'high'
    }
  };
}

export function projectSummary(p: Project) {
  return {
    id: p.id,
    name: p.name,
    owner: p.owner,
    location: p.location,
    areaMu: p.areaMu,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    hasTerrain: !!p.terrain,
    plantCount: p.rows?.plants.length ?? 0
  };
}
