import type { PageKey, Project, ProjectSummary } from './types.ts';
import { createProject } from './lib/project.ts';
import { projectStorage } from './lib/storage.ts';
import { generateHillTerrain } from './lib/terrain.ts';
import { runFullTerrainAnalysis } from './lib/workflows.ts';
import { createProfileLine, defaultProfileEndpoints } from './lib/profile.ts';
import { autoGenerateGuides } from './lib/hydrology.ts';

type Listener = () => void;

class WorkbenchStore {
  route: PageKey = 'projects';
  summaries: ProjectSummary[] = [];
  current: Project | null = null;
  loading = false;
  toast: { type: 'info' | 'success' | 'error'; text: string } | null = null;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn());
  }

  setToast(text: string, type: 'info' | 'success' | 'error' = 'info') {
    this.toast = { text, type };
    this.emit();
    setTimeout(() => {
      this.toast = null;
      this.emit();
    }, 3200);
  }

  async refreshSummaries() {
    this.summaries = await projectStorage.list();
    this.emit();
  }

  async init() {
    this.route = this.routeFromHash();
    window.addEventListener('hashchange', () => {
      this.route = this.routeFromHash();
      if (this.route !== 'projects' && !this.current) {
        window.location.hash = '#/projects';
        return;
      }
      this.emit();
    });
    await this.refreshSummaries();
    const id = window.location.hash.match(/project=([^&]+)/)?.[1];
    if (id && this.route !== 'projects') {
      await this.openProject(id, false);
    }
    this.emit();
  }

  routeFromHash(): PageKey {
    const hash = window.location.hash;
    if (hash.startsWith('#/terrain')) return 'terrain';
    if (hash.startsWith('#/terrace')) return 'terrace';
    if (hash.startsWith('#/rows')) return 'rows';
    if (hash.startsWith('#/season')) return 'season';
    if (hash.startsWith('#/settings')) return 'settings';
    return 'projects';
  }

  navigate(page: PageKey, projectId?: string) {
    const id = projectId ?? this.current?.id;
    const suffix = id && page !== 'projects' ? `?project=${id}` : '';
    window.location.hash = `#/${page}${suffix}`;
  }

  async createAndOpen(input?: Partial<Pick<Project, 'name' | 'owner' | 'location' | 'areaMu'>>) {
    const project = createProject(input);
    // 无测绘数据时直接给出一座可规划的示例山头，业主打开就能看懂三维效果。
    project.terrain = generateHillTerrain({ segments: 512, size: 300 });
    const estimatedAreaMu = Math.round((300 * 300) / 666.67 * 10) / 10;
    project.areaMu = input?.areaMu && input.areaMu > 0 ? input.areaMu : estimatedAreaMu;
    runFullTerrainAnalysis(project);
    const endpoints = defaultProfileEndpoints(project.terrain);
    project.profile = createProfileLine(project.terrain, project.terrace, endpoints.start, endpoints.end);
    if (project.hydrology && project.slope) {
      project.lines = autoGenerateGuides(project.terrain, project.slope, project.hydrology);
    }
    await projectStorage.save(project);
    await this.refreshSummaries();
    await this.openProject(project.id);
  }

  async openProject(id: string, navigate = true) {
    this.loading = true;
    this.emit();
    this.current = await projectStorage.get(id) ?? null;
    this.loading = false;
    if (!this.current) {
      this.setToast('项目不存在或已被删除', 'error');
      this.navigate('projects');
      return;
    }
    if (navigate) this.navigate('terrain', id);
    this.emit();
  }

  async deleteProject(id: string) {
    await projectStorage.remove(id);
    if (this.current?.id === id) this.current = null;
    await this.refreshSummaries();
    this.setToast('项目已删除', 'success');
  }

  async duplicateProject(id: string) {
    const source = await projectStorage.get(id);
    if (!source) return;
    const copy: Project = {
      ...source,
      id: `proj_${Date.now().toString(36)}_copy`,
      name: `${source.name} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await projectStorage.save(copy);
    await this.refreshSummaries();
    this.setToast('项目已复制', 'success');
  }

  async update(mutator: (project: Project) => void, options: { silent?: boolean; save?: boolean } = {}) {
    if (!this.current) return;
    mutator(this.current);
    this.current.updatedAt = Date.now();
    if (!options.silent) this.emit();
    if (options.save !== false) this.scheduleSave();
  }

  scheduleSave() {
    if (!this.current) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      if (this.current) {
        await projectStorage.save(this.current);
        await this.refreshSummaries();
      }
    }, 450);
  }

  async saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.current) {
      await projectStorage.save(this.current);
      await this.refreshSummaries();
      this.setToast('项目已保存到本机浏览器', 'success');
    }
  }

  async importProject(project: Project) {
    await projectStorage.save(project);
    await this.refreshSummaries();
    await this.openProject(project.id);
  }
}

export const store = new WorkbenchStore();
