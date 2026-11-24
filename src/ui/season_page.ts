import { store } from '../store.ts';
import { mountViewer } from './viewer_host.ts';
import { icons } from './icons.ts';
import { downloadViewerPng } from './controls.ts';
import type { SeasonKey } from '../types.ts';

const SEASONS: Array<{ key: SeasonKey; name: string; desc: string; colors: string[] }> = [
  { key: 'spring', name: '春梢', desc: '嫩绿冠层与明亮春梢，晨雾较柔', colors: ['#1f6b2c', '#9ed33f', '#d9f99d'] },
  { key: 'summer', name: '盛夏', desc: '浓绿厚实，光照强烈', colors: ['#0f4d22', '#2f7d32', '#86efac'] },
  { key: 'autumn', name: '秋冬', desc: '青铜、黄褐与少量暖色梢', colors: ['#6b3f16', '#c77b22', '#fbbf24'] },
  { key: 'winter', name: '冬季', desc: '深墨绿，冷色晨雾', colors: ['#1e3a2f', '#486452', '#cbd5e1'] }
];

export function renderSeasonPage(root: HTMLElement) {
  const project = store.current!;
  if (!project.terrain) {
    root.innerHTML = `<div class="card empty-state"><div class="empty-icon">${icons.season}</div><h3>还没有三维地形</h3><p>先生成或导入地形，再预览季相和晨雾。</p><button class="btn btn-primary" id="go">前往地形导入</button></div>`;
    root.querySelector('#go')!.addEventListener('click', () => store.navigate('terrain'));
    return;
  }

  root.innerHTML = `
    <div class="season-layout">
      <aside class="card panel">
        <h3 class="card-title">${icons.season}季相</h3>
        <div class="season-grid">
          ${SEASONS.map((s) => `
            <button class="season-card ${project.season.season === s.key ? 'active' : ''}" data-season="${s.key}">
              <span class="season-swatches">${s.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
              <strong>${s.name}</strong>
              <small>${s.desc}</small>
            </button>`).join('')}
        </div>

        <div class="section-divider"></div>
        <h3 class="card-title">晨雾与光照</h3>
        <div class="switch-row"><span>启用晨雾</span><button class="switch ${project.season.fogEnabled ? 'on' : ''}" id="fog-toggle"></button></div>
        <div class="field"><label>雾浓度<output>${project.season.fogDensity.toFixed(4)}</output></label><input type="range" id="fog-density" min="0.0005" max="0.014" step="0.0002" value="${project.season.fogDensity}" /></div>
        <div class="field"><label>山谷晨雾<output>${Math.round(project.season.morningMist * 100)}%</output></label><input type="range" id="mist" min="0" max="1" step="0.05" value="${project.season.morningMist}" /></div>
        <div class="field"><label>太阳方位<output>${project.season.sunAzimuth}°</output></label><input type="range" id="azimuth" min="0" max="360" step="5" value="${project.season.sunAzimuth}" /></div>
        <div class="field"><label>太阳高度<output>${project.season.sunHeight}°</output></label><input type="range" id="sun-height" min="12" max="80" step="1" value="${project.season.sunHeight}" /></div>

        <div class="section-divider"></div>
        <button class="btn btn-primary" id="snapshot" style="width:100%">${icons.camera}导出当前效果图</button>
      </aside>
      <div class="card viewer-card season-viewer">
        <div class="viewer-host" id="viewer-host"></div>
        <div class="viewer-hud"><span class="hud-pill" data-fps>-- FPS</span><span class="hud-pill">${(project.rows?.plants.length ?? 0).toLocaleString()} 株实例化茶树</span></div>
        <div class="viewer-hint">四季冠色、山谷雾和距离雾均由 WebGL2 Shader 实时计算</div>
      </div>
    </div>
  `;

  const viewer = mountViewer(root.querySelector('#viewer-host') as HTMLElement, project, (stats) => {
    const el = root.querySelector('[data-fps]');
    if (el) el.textContent = `${stats.fps} FPS · ${stats.instances.toLocaleString()} inst`;
  });

  root.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((btn) => btn.addEventListener('click', () => {
    const season = btn.dataset.season as SeasonKey;
    store.update((p) => { p.season.season = season; }, { silent: true });
    root.querySelectorAll('[data-season]').forEach((b) => b.classList.toggle('active', b === btn));
    store.scheduleSave();
  }));

  root.querySelector('#fog-toggle')!.addEventListener('click', (e) => {
    const value = !project.season.fogEnabled;
    store.update((p) => { p.season.fogEnabled = value; }, { silent: true });
    (e.currentTarget as HTMLButtonElement).classList.toggle('on', value);
  });

  const bindNumber = (id: string, key: 'fogDensity' | 'morningMist' | 'sunAzimuth' | 'sunHeight', digits = 0) => {
    const input = root.querySelector<HTMLInputElement>(id)!;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      store.update((p) => { p.season[key] = value; }, { silent: true, save: false });
      const out = input.closest('.field')?.querySelector('output');
      if (out) out.textContent = key === 'fogDensity' ? value.toFixed(4) : key === 'morningMist' ? `${Math.round(value * 100)}%` : `${value}°`;
    });
    input.addEventListener('change', () => store.scheduleSave());
    void digits;
  };
  bindNumber('#fog-density', 'fogDensity');
  bindNumber('#mist', 'morningMist');
  bindNumber('#azimuth', 'sunAzimuth');
  bindNumber('#sun-height', 'sunHeight');

  root.querySelector('#snapshot')!.addEventListener('click', () => {
    if (downloadViewerPng(`${project.name}-${project.season.season}.png`)) store.setToast('效果图已导出', 'success');
  });
}
