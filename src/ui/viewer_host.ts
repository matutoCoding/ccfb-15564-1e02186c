import type { Project } from '../types.ts';
import { TerrainViewer, type ViewerStats } from '../webgl/viewer.ts';

let activeViewer: TerrainViewer | null = null;

export function mountViewer(
  host: HTMLElement,
  project: Project,
  onStats?: (stats: ViewerStats) => void
): TerrainViewer {
  activeViewer?.dispose();
  activeViewer = null;
  host.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.className = 'webgl-canvas';
  host.appendChild(canvas);
  activeViewer = new TerrainViewer(canvas, project, onStats);
  return activeViewer;
}

export function getViewer(): TerrainViewer | null {
  return activeViewer;
}

export function disposeViewer() {
  activeViewer?.dispose();
  activeViewer = null;
}
