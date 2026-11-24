import { store } from '../store.ts';
import { icons } from './icons.ts';
import { mountViewer } from './viewer_host.ts';
import { statCard } from './controls.ts';
import { VARIETY_PRESETS } from '../lib/rows.ts';
import { runRowDesign } from '../lib/workflows.ts';
import { downloadText, teaRowsCsv } from '../lib/exchange.ts';
import { formatNumber } from '../lib/math.ts';
import type { RowParams, VarietyKey } from '../types.ts';

export function renderRowsPage(root: HTMLElement) {
  const project = store.current!;
  if (!project.terrain || !project.terrace) {
    root.innerHTML = `<div class="card empty-state"><div class="empty-icon">${icons.rows}</div><h3>茶行需要台面数据</h3><p>请先生成地形和梯田。</p><button class="btn btn-primary" id="go">前往梯田设计</button></div>`;
    root.querySelector('#go')!.addEventListener('click', () => store.navigate('terrace'));
    return;
  }

  root.innerHTML = `
    <div class="workspace-grid rows-grid">
      <aside class="card panel">
        <h3 class="card-title">${icons.rows}品种与株行距</h3>
        <div class="field" style="margin-top:16px">
          <label>茶树品种</label>
          <select class="input" id="variety">
            ${Object.entries(VARIETY_PRESETS).map(([key, v]) => `<option value="${key}" ${project.rowParams.variety === key ? 'selected' : ''}>${v.label}（行 ${v.rowSpacing}m / 株 ${v.plantSpacing}m）</option>`).join('')}
            <option value="custom" ${project.rowParams.variety === 'custom' ? 'selected' : ''}>自定义</option>
          </select>
        </div>
        <div id="sliders"></div>
        <button class="btn btn-primary" id="generate-rows" style="width:100%">${icons.refresh}沿等高线布置茶行</button>
        <button class="btn" id="export-rows" style="width:100%;margin-top:8px">${icons.download}导出茶行坐标 CSV</button>

        <div class="section-divider"></div>
        <div class="switch-row"><span>显示茶行线</span><button class="switch ${project.view.showRows ? 'on' : ''}" data-view="showRows"></button></div>
        <div class="switch-row"><span>实例化茶树</span><button class="switch ${project.view.showPlants ? 'on' : ''}" data-view="showPlants"></button></div>

        <div class="section-divider"></div>
        <div id="row-stats" class="grid grid-2"></div>
        <div class="table-wrap" style="margin-top:16px;max-height:260px" id="row-table"></div>
      </aside>

      <div class="card viewer-card">
        <div class="viewer-host" id="viewer-host"></div>
        <div class="viewer-hud"><span class="hud-pill" data-fps>-- FPS</span><span class="hud-pill" data-count>${(project.rows?.plants.length ?? 0).toLocaleString()} 株</span></div>
        <div class="viewer-tools"><button class="btn btn-sm" id="snapshot">${icons.camera}效果图</button></div>
        <div class="viewer-hint">弯道按弧长独立密疏，空间哈希剔除过近植株，避免挤成一团</div>
      </div>
    </div>
  `;

  const sliders = root.querySelector<HTMLElement>('#sliders')!;
  const sliderDefs: Array<{ key: keyof RowParams; label: string; min: number; max: number; step: number; unit: string }> = [
    { key: 'rowSpacing', label: '行距', min: .8, max: 2.4, step: .05, unit: ' m' },
    { key: 'plantSpacing', label: '株距', min: .2, max: 1.2, step: .01, unit: ' m' },
    { key: 'edgeMargin', label: '台边留白', min: .15, max: 1.2, step: .02, unit: ' m' },
    { key: 'minPlantDistance', label: '弯道最小净距', min: .15, max: .8, step: .01, unit: ' m' }
  ];
  sliders.innerHTML = sliderDefs.map((d) => `
    <div class="field">
      <label>${d.label}<output>${project.rowParams[d.key]}${d.unit}</output></label>
      <input type="range" data-key="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${project.rowParams[d.key]}" data-unit="${d.unit}" />
    </div>`).join('');

  const viewer = mountViewer(root.querySelector<HTMLElement>('#viewer-host')!, project, (stats) => {
    const fps = root.querySelector('[data-fps]');
    if (fps) fps.textContent = `${stats.fps} FPS · ${stats.instances.toLocaleString()} 实例`;
  });

  const paintStats = () => {
    const box = root.querySelector<HTMLElement>('#row-stats')!;
    const rows = project.rows?.rows ?? [];
    const plants = project.rows?.plants ?? [];
    const length = rows.reduce((sum, r) => sum + r.length, 0);
    const areaMu = project.terrain ? (project.terrain.cols - 1) * project.terrain.cellX * (project.terrain.rows - 1) * project.terrain.cellZ / 666.67 : 0;
    box.innerHTML = `
      ${statCard('茶行段', rows.length.toLocaleString(), '段')}
      ${statCard('茶树', plants.length.toLocaleString(), '株', plants.length >= 100000 ? 'success' : '')}
      ${statCard('茶行总长', formatNumber(length, 0), 'm')}
      ${statCard('密度', areaMu ? formatNumber(plants.length / areaMu, 0) : '--', '株/亩')}
    `;
    const table = root.querySelector<HTMLElement>('#row-table')!;
    table.innerHTML = rows.length ? `
      <table class="data-table">
        <thead><tr><th>行</th><th>台块</th><th>株数</th><th>长度/m</th></tr></thead>
        <tbody>${rows.slice(0, 80).map((r) => `<tr><td>#${r.id}</td><td>${r.benchId + 1}</td><td>${r.plantCount}</td><td>${formatNumber(r.length, 1)}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="help">尚未生成茶行。</p>';
    root.querySelector('[data-count]')!.textContent = `${plants.length.toLocaleString()} 株`;
  };
  paintStats();

  root.querySelector<HTMLSelectElement>('#variety')!.addEventListener('change', (e) => {
    const variety = (e.target as HTMLSelectElement).value as VarietyKey;
    store.update((p) => {
      p.rowParams.variety = variety;
      if (variety !== 'custom') Object.assign(p.rowParams, VARIETY_PRESETS[variety]);
    }, { silent: true });
    renderRowsPage(root);
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  sliders.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.key as keyof RowParams;
      const value = Number(input.value);
      const output = input.closest('.field')?.querySelector('output');
      if (output) output.textContent = `${value}${input.dataset.unit}`;
      store.update((p) => {
        (p.rowParams as unknown as Record<string, number | string>)[key] = value;
        p.rowParams.variety = 'custom';
      }, { silent: true, save: false });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => generate(false), 260);
    });
  });

  const generate = (toast = true) => {
    root.querySelector('#generate-rows')!.setAttribute('disabled', 'true');
    setTimeout(() => {
      runRowDesign(project);
      viewer.setProject(project);
      paintStats();
      root.querySelector('#generate-rows')!.removeAttribute('disabled');
      store.scheduleSave();
      if (toast) store.setToast(`已布置 ${project.rows?.plants.length.toLocaleString()} 株茶树`, 'success');
    }, 30);
  };
  root.querySelector('#generate-rows')!.addEventListener('click', () => generate(true));

  root.querySelector('#export-rows')!.addEventListener('click', () => {
    downloadText(`${project.name}-茶行坐标.csv`, teaRowsCsv(project), 'text/csv;charset=utf-8');
  });

  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.view as 'showRows' | 'showPlants';
    const value = !project.view[key];
    store.update((p) => { p.view[key] = value; }, { silent: true });
    btn.classList.toggle('on', value);
    if (key === 'showPlants') viewer.setProject(project);
    else viewer.refreshOverlays();
  }));

  root.querySelector('#snapshot')!.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `${project.name}-茶行三维.png`;
    a.href = root.querySelector('canvas')!.toDataURL('image/png');
    a.click();
  });
}
