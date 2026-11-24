import { store } from '../store.ts';
import { icons } from './icons.ts';
import { mountViewer } from './viewer_host.ts';
import { statCard } from './controls.ts';
import { generateHillTerrain } from '../lib/terrain.ts';
import { parseElevationCsv, parseGeoTiffFile } from '../lib/terrain_io.ts';
import { runFullTerrainAnalysis } from '../lib/workflows.ts';
import { formatNumber } from '../lib/math.ts';
import type { ViewSettings } from '../types.ts';

export function renderTerrainPage(root: HTMLElement) {
  const p = store.current!;
  root.innerHTML = `
    <div class="workspace-grid">
      <aside class="card panel">
        <h3 class="card-title">${icons.upload}地形数据源</h3>
        <p class="card-sub">支持 GeoTIFF 首波段高程、高程矩阵 CSV 或 X/Y/Z 点表；没有测绘数据时可生成带山脊、沟谷的解析感山头。</p>
        <div class="btn-row" style="margin:16px 0">
          <button class="btn btn-primary" id="import-geotiff">${icons.upload}GeoTIFF</button>
          <button class="btn" id="import-csv">CSV</button>
          <input type="file" id="terrain-file" accept=".tif,.tiff,.csv,text/csv" hidden />
        </div>

        <div class="section-divider"></div>
        <h3 class="card-title">程序生成山头</h3>
        <div class="field" style="margin-top:16px">
          <label>地形精度</label>
          <select class="input" id="gen-resolution">
            <option value="256">256²（流畅）</option>
            <option value="512" selected>512²（推荐）</option>
            <option value="1024">1024²（性能校核）</option>
          </select>
        </div>
        <div class="grid grid-2">
          <div class="field"><label>山体尺寸/m</label><input class="input" id="gen-size" type="number" value="300" min="80" max="2000" step="20" /></div>
          <div class="field"><label>主峰高/m</label><input class="input" id="gen-height" type="number" value="62" min="20" max="300" step="2" /></div>
        </div>
        <div class="field"><label>随机种子</label><input class="input" id="gen-seed" type="number" value="20261125" /></div>
        <button class="btn btn-accent" id="generate-terrain" style="width:100%">${icons.refresh}生成并分析地形</button>
        <p class="help" id="generate-status" style="margin-top:8px">生成后会自动计算坡度、坡向、梯田和汇流。</p>

        <div class="section-divider"></div>
        <h3 class="card-title">显示图层</h3>
        <div class="segmented" id="display-mode">
          ${(['realistic', 'slope', 'earthwork', 'flow'] as ViewSettings['displayMode'][]).map((m) => `<button data-mode="${m}" class="${p.view.displayMode === m ? 'active' : ''}">${modeLabel(m)}</button>`).join('')}
        </div>
        <div class="switch-row"><span>显示挖填后地形</span><button class="switch ${p.view.showDesigned ? 'on' : ''}" data-toggle="showDesigned"></button></div>
        <div class="switch-row"><span>汇水流向箭头</span><button class="switch ${p.view.showFlow ? 'on' : ''}" data-toggle="showFlow"></button></div>

        <div class="section-divider"></div>
        <div id="terrain-stats" class="grid grid-2"></div>
      </aside>

      <div class="card viewer-card">
        <div class="viewer-host" id="viewer-host"></div>
        <div class="viewer-hud">
          <span class="hud-pill" data-fps>-- FPS</span>
          <span class="hud-pill" data-instances>0 株</span>
          <span class="hud-pill" id="terrain-dim">${p.terrain ? `${p.terrain.cols} × ${p.terrain.rows}` : '未加载地形'}</span>
        </div>
        <div class="viewer-tools">
          <button class="btn btn-sm" id="snapshot">${icons.camera}效果图</button>
        </div>
        <div class="viewer-hint">左键旋转 · 右键平移 · 滚轮缩放</div>
      </div>
    </div>
  `;

  const host = root.querySelector<HTMLElement>('#viewer-host')!;
  let viewer: ReturnType<typeof mountViewer> | null = null;
  try {
    viewer = mountViewer(host, p, (stats) => {
      const fps = root.querySelector('[data-fps]');
      const inst = root.querySelector('[data-instances]');
      if (fps) fps.textContent = `${stats.fps} FPS · ${Math.round(stats.triangles / 10000) / 100}万面`;
      if (inst) inst.textContent = `${stats.instances.toLocaleString()} 实例`;
    });
  } catch (e) {
    host.innerHTML = `<div class="empty-state"><div class="empty-icon">${icons.warning}</div><h3>WebGL2 初始化失败</h3><p>${(e as Error).message}</p></div>`;
  }

  const paintStats = () => {
    const box = root.querySelector<HTMLElement>('#terrain-stats')!;
    if (!p.terrain || !p.slope) {
      box.innerHTML = statCard('地形状态', '未加载');
      return;
    }
    let over = 0;
    let sum = 0;
    let max = 0;
    let aspectSin = 0;
    let aspectCos = 0;
    for (let i = 0; i < p.slope.slopeDeg.length; i++) {
      const s = p.slope.slopeDeg[i];
      if (s > p.terraceParams.maxSlopeDeg) over++;
      sum += s;
      max = Math.max(max, s);
      if (s > 5) {
        const weight = Math.min(1, s / 20);
        aspectSin += Math.sin(p.slope.aspectRad[i]) * weight;
        aspectCos += Math.cos(p.slope.aspectRad[i]) * weight;
      }
    }
    const total = p.slope.slopeDeg.length;
    const buildable = ((total - over) / total) * 100;
    const areaMu = (p.terrain.cols - 1) * p.terrain.cellX * (p.terrain.rows - 1) * p.terrain.cellZ / 666.67;
    const aspectTheta = Math.atan2(aspectSin, aspectCos) * 180 / Math.PI;
    const aspectCompass = (90 - aspectTheta + 360) % 360;
    box.innerHTML = `
      ${statCard('平均坡度', formatNumber(sum / total, 1), '°')}
      ${statCard('最大坡度', formatNumber(max, 1), '°')}
      ${statCard(`超${p.terraceParams.maxSlopeDeg}°禁垦`, formatNumber(over / total * 100, 1), '%', over ? 'danger' : '')}
      ${statCard('宜梯田比例', formatNumber(buildable, 1), '%', 'success')}
      ${statCard('主坡向', formatNumber(aspectCompass, 0), '°')}
      ${statCard('估算面积', formatNumber(areaMu, 1), '亩')}
      ${statCard('高程范围', `${formatNumber(p.terrain.minElev, 1)}–${formatNumber(p.terrain.maxElev, 1)}`, 'm')}
    `;
    root.querySelector('#terrain-dim')!.textContent = `${p.terrain.cols}×${p.terrain.rows} · ${formatNumber((p.terrain.cols - 1) * p.terrain.cellX, 0)}m`;
  };
  paintStats();

  root.querySelector('#generate-terrain')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const status = root.querySelector<HTMLElement>('#generate-status')!;
    btn.disabled = true;
    status.textContent = '正在生成高程、坡度、梯田与汇流，1024² 可能需要一两秒...';
    await new Promise((r) => setTimeout(r, 40));
    try {
      const segments = Number(root.querySelector<HTMLSelectElement>('#gen-resolution')!.value);
      const size = Number(root.querySelector<HTMLInputElement>('#gen-size')!.value);
      const peakHeight = Number(root.querySelector<HTMLInputElement>('#gen-height')!.value);
      const seed = Number(root.querySelector<HTMLInputElement>('#gen-seed')!.value);
      const terrain = generateHillTerrain({ segments, size, peakHeight, seed });
      await store.update((project) => {
        project.terrain = terrain;
        project.areaMu = Math.round(size * size / 666.67 * 10) / 10;
        runFullTerrainAnalysis(project);
      });
      viewer?.setProject(store.current, true);
      paintStats();
      store.setToast('山头生成并分析完成', 'success');
    } finally {
      btn.disabled = false;
      status.textContent = '生成后会自动计算坡度、坡向、梯田和汇流。';
    }
  });

  const fileInput = root.querySelector<HTMLInputElement>('#terrain-file')!;
  root.querySelector('#import-geotiff')!.addEventListener('click', () => {
    fileInput.dataset.kind = 'geotiff';
    fileInput.click();
  });
  root.querySelector('#import-csv')!.addEventListener('click', () => {
    fileInput.dataset.kind = 'csv';
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      store.setToast('正在解析地形文件...');
      const terrain = fileInput.dataset.kind === 'geotiff' || /\.tiff?$/i.test(file.name)
        ? await parseGeoTiffFile(file)
        : parseElevationCsv(await file.text(), file.name.replace(/\.[^.]+$/, ''));
      await store.update((project) => {
        project.terrain = terrain;
        runFullTerrainAnalysis(project);
      });
      viewer?.setProject(store.current, true);
      paintStats();
      store.setToast('地形导入成功', 'success');
    } catch (err) {
      store.setToast(`地形导入失败：${(err as Error).message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as ViewSettings['displayMode'];
      store.update((project) => {
        project.view.displayMode = mode;
        if (mode === 'flow') project.view.showFlow = true;
        if (mode === 'earthwork') project.view.showDesigned = true;
      }, { silent: true });
      root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      const flowSwitch = root.querySelector<HTMLButtonElement>('[data-toggle="showFlow"]');
      flowSwitch?.classList.toggle('on', p.view.showFlow);
      viewer?.setProject(store.current);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle as keyof ViewSettings;
      const value = !p.view[key];
      store.update((project) => { (project.view as unknown as Record<string, unknown>)[key] = value; }, { silent: true });
      btn.classList.toggle('on', value);
      if (key === 'showDesigned') viewer?.setProject(store.current);
      else viewer?.refreshOverlays();
    });
  });

  root.querySelector('#snapshot')!.addEventListener('click', () => {
    const canvas = host.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${p.name}-三维效果.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
}

function modeLabel(mode: string) {
  if (mode === 'slope') return '坡度';
  if (mode === 'earthwork') return '挖填';
  if (mode === 'flow') return '汇流';
  return '梯田';
}
