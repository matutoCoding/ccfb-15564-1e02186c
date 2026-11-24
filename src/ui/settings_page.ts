import { store } from '../store.ts';
import { icons } from './icons.ts';
import { mountViewer } from './viewer_host.ts';
import { statCard } from './controls.ts';
import { validateEarthwork, type EarthworkValidationReport } from '../lib/validation.ts';
import { serializeProject, downloadText } from '../lib/exchange.ts';
import type { ViewSettings } from '../types.ts';

export function renderSettingsPage(root: HTMLElement) {
  const project = store.current!;
  root.innerHTML = `
    <div class="settings-grid">
      <div class="settings-col">
        <section class="card card-pad">
          <h3 class="card-title">${icons.settings}项目信息</h3>
          <div class="field" style="margin-top:16px"><label>项目名称</label><input class="input" id="p-name" value="${project.name}" /></div>
          <div class="grid grid-2">
            <div class="field"><label>负责人</label><input class="input" id="p-owner" value="${project.owner}" /></div>
            <div class="field"><label>面积/亩</label><input class="input" id="p-area" type="number" value="${project.areaMu}" /></div>
          </div>
          <div class="field"><label>位置</label><input class="input" id="p-location" value="${project.location}" /></div>
          <button class="btn btn-primary" id="save-meta">${icons.save}保存信息</button>
        </section>

        <section class="card card-pad">
          <h3 class="card-title">渲染质量</h3>
          <p class="card-sub">地形精度决定网格抽稀和像素比；挖填方始终使用独立亚格子积分，不受显示抽稀影响。</p>
          <div class="segmented" style="margin-top:16px" id="quality">
            ${(['low', 'medium', 'high'] as ViewSettings['quality'][]).map((q) => `<button data-q="${q}" class="${project.view.quality === q ? 'active' : ''}">${q === 'low' ? '流畅' : q === 'medium' ? '均衡' : '高精度'}</button>`).join('')}
          </div>
          <div class="switch-row"><span>等高/台块线</span><button class="switch ${project.view.showTerraceLines ? 'on' : ''}" data-toggle="showTerraceLines"></button></div>
          <div class="switch-row"><span>排水沟/步道</span><button class="switch ${project.view.showGuides ? 'on' : ''}" data-toggle="showGuides"></button></div>
        </section>

        <section class="card card-pad">
          <h3 class="card-title">挖填方精度核对</h3>
          <p class="card-sub">用解析斜面和圆锥面生成已知地形，比较系统积分与 2048² 解析设计面密采样结果。</p>
          <button class="btn btn-accent" id="run-validation" style="width:100%;margin-top:16px">运行 &lt;1% 精度校核</button>
          <div id="validation-result" style="margin-top:16px"></div>
        </section>

        <section class="card card-pad danger-zone">
          <h3 class="card-title">数据</h3>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn" id="export-project">${icons.download}导出项目</button>
            <button class="btn btn-danger" id="delete-project">${icons.trash}删除项目</button>
          </div>
        </section>
      </div>

      <div class="card viewer-card settings-viewer">
        <div class="viewer-host" id="viewer-host"></div>
        <div class="viewer-hud"><span class="hud-pill" data-fps>-- FPS</span><span class="hud-pill" data-instances>0</span></div>
        <div class="viewer-tools"><button class="btn btn-sm" id="stress">10万株压力测试</button></div>
        <div class="viewer-hint">点击压力测试后使用实例化渲染；再次点击关闭</div>
      </div>
    </div>
  `;

  let viewer: ReturnType<typeof mountViewer> | null = null;
  if (project.terrain) {
    viewer = mountViewer(root.querySelector('#viewer-host') as HTMLElement, project, (stats) => {
      root.querySelector('[data-fps]')!.textContent = `${stats.fps} FPS`;
      root.querySelector('[data-instances]')!.textContent = `${stats.instances.toLocaleString()} instances · ${Math.round(stats.triangles / 10000) / 100}万 triangles`;
    });
  } else {
    root.querySelector('#viewer-host')!.innerHTML = `<div class="empty-state"><p class="muted">生成地形后可在此做性能压测</p></div>`;
  }

  root.querySelector('#save-meta')!.addEventListener('click', () => {
    store.update((p) => {
      p.name = root.querySelector<HTMLInputElement>('#p-name')!.value;
      p.owner = root.querySelector<HTMLInputElement>('#p-owner')!.value;
      p.location = root.querySelector<HTMLInputElement>('#p-location')!.value;
      p.areaMu = Number(root.querySelector<HTMLInputElement>('#p-area')!.value) || 0;
    });
    store.saveNow();
  });

  root.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((btn) => btn.addEventListener('click', () => {
    const q = btn.dataset.q as ViewSettings['quality'];
    store.update((p) => { p.view.quality = q; }, { silent: true });
    root.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('active', b === btn));
    viewer?.setProject(project);
  }));

  root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.toggle as keyof ViewSettings;
    const value = !project.view[key];
    store.update((p) => { (p.view as unknown as Record<string, unknown>)[key] = value; }, { silent: true });
    btn.classList.toggle('on', value);
    viewer?.refreshOverlays();
  }));

  let stress = false;
  root.querySelector('#stress')?.addEventListener('click', (e) => {
    if (!viewer) return;
    stress = !stress;
    viewer.setStressTest(stress);
    (e.currentTarget as HTMLButtonElement).textContent = stress ? '关闭压力测试' : '10万株压力测试';
  });

  root.querySelector('#run-validation')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const result = root.querySelector<HTMLElement>('#validation-result')!;
    btn.disabled = true;
    result.innerHTML = `<p class="help">正在进行六组解析地形式校核，请稍候...</p>`;
    await new Promise((r) => setTimeout(r, 40));
    try {
      const report = validateEarthwork(1);
      result.innerHTML = validationHtml(report);
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector('#export-project')!.addEventListener('click', () => {
    downloadText(`${project.name}.json`, serializeProject(project), 'application/json');
  });
  root.querySelector('#delete-project')!.addEventListener('click', async () => {
    if (!window.confirm('确定删除当前项目？此操作不可恢复。')) return;
    await store.deleteProject(project.id);
    store.navigate('projects');
  });
}

function validationHtml(report: EarthworkValidationReport): string {
  return `
    <div class="grid grid-2" style="margin-bottom:12px">
      ${statCard('校核结论', report.allPassed ? 'PASS' : 'FAIL', '', report.allPassed ? 'success' : 'danger')}
      ${statCard('误差阈值', report.tolerancePct.toFixed(1), '%')}
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>场景</th><th>挖方误差</th><th>填方误差</th><th>净方差</th><th>结论</th></tr></thead>
      <tbody>${report.cases.map((c) => `
        <tr><td>${c.name}</td><td>${c.cutErrorPct.toFixed(4)}%</td><td>${c.fillErrorPct.toFixed(4)}%</td><td>${c.netErrorPct.toFixed(4)}%</td><td><span class="badge ${c.passed ? 'badge-success' : 'badge-danger'}">${c.passed ? 'PASS' : 'FAIL'}</span></td></tr>
      `).join('')}</tbody>
    </table></div>`;
}
