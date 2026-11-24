import type { Project } from '../types.ts';
import { computeSlopeAspect } from './terrain.ts';
import { generateTerraces } from './terrace.ts';
import { generateTeaRows } from './rows.ts';
import { computeHydrology } from './hydrology.ts';
import { createProfileLine } from './profile.ts';

export function runFullTerrainAnalysis(project: Project) {
  if (!project.terrain) return;
  project.slope = computeSlopeAspect(project.terrain);
  project.terrace = generateTerraces(project.terrain, project.slope, project.terraceParams);
  project.hydrology = computeHydrology(project.terrain);
  project.rows = generateTeaRows(project.terrain, project.terrace, project.rowParams);
  refreshProfile(project);
}

export function runTerraceDesign(project: Project) {
  if (!project.terrain || !project.slope) return;
  project.terrace = generateTerraces(project.terrain, project.slope, project.terraceParams);
  if (project.rows) project.rows = generateTeaRows(project.terrain, project.terrace, project.rowParams);
  refreshProfile(project);
}

export function runRowDesign(project: Project) {
  if (!project.terrain || !project.terrace) return;
  project.rows = generateTeaRows(project.terrain, project.terrace, project.rowParams);
}

export function runHydrology(project: Project) {
  if (!project.terrain) return;
  project.hydrology = computeHydrology(project.terrain);
}

export function refreshProfile(project: Project) {
  if (!project.terrain || !project.profile) return;
  project.profile = createProfileLine(project.terrain, project.terrace, project.profile.start, project.profile.end);
}
