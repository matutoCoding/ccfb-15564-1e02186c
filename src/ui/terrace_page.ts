import { store } from '../store.ts';
import { icons } from './icons.ts';
import { mountViewer } from './viewer_host.ts';
import { sliderField } from './controls.ts';
import { earthworkStatsHtml, earthworkTableHtml, profilePanelHtml } from './terrace_panels.ts';
import { createProfileLine, defaultProfileEndpoints } from '../lib/profile.ts';
import { runTerraceDesign } from '../lib/workflows.ts';
import { downloadText, earthworkCsv } from '../lib/exchange.ts';
import { bindProfileHover } from './profile_chart.ts';
import { openGuideEditor } from './guide_modal.ts';
import type { TerraceParams } from '../types.ts';

export function renderTerracePage(root: HTMLElement) {
  const project = store.current!;
  if (!project.terrain || !project.slope || !project.terrace) {
    root.innerHTML = `<div class="card empty-state"><div class="empty-icon">${icons.terrain}</div><h3>请先准备地形</h3><p>导入 GeoTIFF/CSV，或直接生成一座示例山头。</p><button class="btn btn-primary" id="go-terrain">前往地形导入</button></div>`;
    root.querySelector('#go-terrain')!.addEventListener('click', () => store.navigate('terrain'));
    return;
  }

  root.innerHTML = `
    <div class="terrace-layout">
      <aside class="card panel">
        <h3 class="card-title">${icons.terrace}梯田参数</h3>
        <p class="card-sub">梯田按高程相位沿等高线生成；台面宽和坎高共同决定坎线相位，超过坡度阈值的格子不动土。</p>
        <div style="margin-top:16px">
          ${sliderField({ label: '台面宽度', value: project.terraceParams.benchWidth, min: 1.6, max: 8, step: .1, unit: ' m' })}
          ${sliderField({ label: '田坎高度', value: project.terraceParams.riserHeight, min: .6, max: 3, step: .05, unit: ' m' })}
          ${sliderField({ label: '禁垦坡度', value: project.terraceParams.maxSlopeDeg, min: 15, max: 35, step: 1, unit: '°' })}
          ${sliderField({ label: '坎坡上限', value: project.terraceParams.riserMaxAngleDeg, min: 45, max: 80, step: 1, unit: '°' })}
          ${sliderField({ label: '台面反坡', value: project.terraceParams.reverseSlope * 100, min: 0, max: 8, step: .1, unit: '%' })}
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="rebuild-terrace" style="flex:1">${icons.refresh}重新生成</button>
          <button class="btn" id="export-earth">${icons.download}挖填方</button>
        </div>
        <div class="section-divider"></div>
        <h3 class="card-title">排水与步道</h3>
        <p class="card-sub">按最大坡度方向追踪，支持平面拖动改线和汇水面积读取。</p>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn-accent" id="guide-editor" style="flex:1">${icons.water}编辑排水沟/步道</button>
        </div>
        <div class="section-divider"></div>
        <div id="earth-stats">${earthworkStatsHtml(project)}</div>
      </aside>

      <div class="terrace-main">
        <div class="card viewer-card terrace-viewer">
          <div class="viewer-host" id="viewer-host"></div>
          <div class="viewer-hud"><span class="hud-pill" data-fps>-- FPS</span><span class="hud-pill">${project.terrace.benchCount} 个台块</span></div>
          <div class="viewer-tools"><button class="btn btn-sm" id="snapshot">${icons.camera}效果图</button></div>
          <div class="viewer-hint" id="pick-hint">左键旋转 · 右键平移 · 可在下方生成剖面</div>
        </div>
        <div class="card bottom-card">
          <div class="tabs">
            <button class="tab active" data-tab="table">挖填方表</button>
            <button class="tab" data-tab="profile">断面图联动</button>
          </div>
          <div class="tab-body" id="tab-body"></div>
        </div>
      </div>
    </div>
  `;

  const host = root.querySelector<HTMLElement>('#viewer-host')!;
  const viewer = mountViewer(host, project, (stats) => {
    const el = root.querySelector('[data-fps]');
    if (el) el.textContent = `${stats.fps} FPS`;
  });

  let activeTab: 'table' | 'profile' = 'table';
  const tabBody = root.querySelector<HTMLElement>('#tab-body')!;
  const paintTab = () => {
    if (activeTab === 'table') {
      tabBody.innerHTML = earthworkTableHtml(project);
    } else {
      tabBody.innerHTML = profilePanelHtml(project);
      bindProfileHover(tabBody, project.profile);
      tabBody.querySelector('#default-profile')?.addEventListener('click', () => {
        const endpoints = defaultProfileEndpoints(project.terrain!);
        project.profile = createProfileLine(project.terrain!, project.terrace, endpoints.start, endpoints.end);
        afterProfileChange();
      });
      tabBody.querySelector('#pick-profile')?.addEventListener('click', startPicking);
    }
  };
  paintTab();

  root.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab as 'table' | 'profile';
    root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    paintTab();
  }));

  let debounce: ReturnType<typeof setTimeout> | null = null;

  root.querySelectorAll<HTMLInputElement>('.field input[type="range"]').forEach((range, index) => {
    const keys: Array<keyof TerraceParams> = ['benchWidth', 'riserHeight', 'maxSlopeDeg', 'riserMaxAngleDeg', 'reverseSlope'];
    range.addEventListener('input', () => {
      const key = keys[index];
      const raw = Number(range.value);
      const value = key === 'reverseSlope' ? raw / 100 : raw;
      const output = range.closest('.field')?.querySelector('output');
      if (output) output.textContent = key === 'reverseSlope' ? `${raw}%` : `${raw}${key === 'benchWidth' ? ' m' : key === 'riserHeight' ? ' m' : '°'}`;
      store.update((p) => { (p.terraceParams as unknown as Record<string, number | null>)[key] = value; }, { silent: true, save: false });
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => rebuild(false), 220);
    });
  });

  const rebuild = (showToast = true) => {
    runTerraceDesign(project);
    viewer.setProject(project);
    root.querySelector('#earth-stats')!.innerHTML = earthworkStatsHtml(project);
    if (activeTab === 'table') paintTab();
    if (showToast) store.setToast('梯田与挖填方已重算', 'success');
    store.scheduleSave();
  };

  root.querySelector('#rebuild-terrace')!.addEventListener('click', () => rebuild());
  root.querySelector('#export-earth')!.addEventListener('click', () => {
    downloadText(`${project.name}-挖填方表.csv`, earthworkCsv(project), 'text/csv;charset=utf-8');
  });
  root.querySelector('#guide-editor')!.addEventListener('click', () => openGuideEditor(() => viewer.refreshOverlays()));
  root.querySelector('#snapshot')!.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `${project.name}-梯田三维.png`;
    a.href = host.querySelector('canvas')!.toDataURL('image/png');
    a.click();
  });

  let picking: { first: { x: number; z: number } | null } = { first: null };
  function startPicking() {
    activeTab = 'profile';
    root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === 'profile'));
    paintTab();
    picking.first = null;
    root.querySelector('#pick-hint')!.textContent = '剖面绘制：请在三维地形上点击起点';
    viewer.onSceneClick = (point) => {
      if (!point) return;
      if (!picking.first) {
        picking.first = { x: point.x, z: point.z };
        root.querySelector('#pick-hint')!.textContent = '已选起点，请点击终点';
        viewer.setMarker([point.x, point.y + 1, point.z]);
      } else {
        const start = picking.first;
        project.profile = createProfileLine(project.terrain!, project.terrace, start, { x: point.x, z: point.z });
        picking.first = null;
        viewer.onSceneClick = undefined;
        root.querySelector('#pick-hint')!.textContent = '剖面已生成，可在断面图上悬停联动';
        afterProfileChange();
      }
    };
  }

  function afterProfileChange() {
    viewer.setProject(project);
    if (activeTab === 'profile') paintTab();
    store.scheduleSave();
  }
}
