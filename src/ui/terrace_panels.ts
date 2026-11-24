import type { Project } from '../types.ts';
import { formatNumber } from '../lib/math.ts';
import { statCard } from './controls.ts';
import { renderProfileSvg } from './profile_chart.ts';

export function earthworkStatsHtml(project: Project): string {
  const r = project.terrace?.volumes;
  if (!r) return `<p class="help">尚未生成梯田。</p>`;
  const balanceTone = r.balanceErrorPct < 1 ? 'success' : r.balanceErrorPct < 5 ? '' : 'danger';
  return `
    <div class="grid grid-2">
      ${statCard('总挖方', formatNumber(r.totalCut, 0), 'm³')}
      ${statCard('总填方', formatNumber(r.totalFill, 0), 'm³')}
      ${statCard('挖填差', formatNumber(r.net, 0), 'm³', Math.abs(r.net) / Math.max(1, (r.totalCut + r.totalFill) / 2) > 0.05 ? 'danger' : 'success')}
      ${statCard('平衡偏差', formatNumber(r.balanceErrorPct, 2), '%', balanceTone)}
    </div>
    <p class="help" style="margin-top:8px">偏差 = |挖-填| / ((挖+填)/2)。闭合环山台块通常接近平衡；项目边界切断台块时会出现真实进出口方量差。</p>
  `;
}

export function earthworkTableHtml(project: Project): string {
  const benches = project.terrace?.volumes.benches.filter((b) => b.benchId >= 0) ?? [];
  return `
    <div class="table-wrap" style="max-height:320px">
      <table class="data-table">
        <thead><tr><th>台块</th><th>挖方/m³</th><th>填方/m³</th><th>净方/m³</th><th>面积/m²</th><th>高程/m</th></tr></thead>
        <tbody>
          ${benches.map((b) => `
            <tr>
              <td>${b.label}</td>
              <td>${formatNumber(b.cut, 1)}</td>
              <td>${formatNumber(b.fill, 1)}</td>
              <td style="color:${b.net > 0 ? '#c2410c' : '#1d4ed8'}">${formatNumber(b.net, 1)}</td>
              <td>${formatNumber(b.area, 0)}</td>
              <td>${formatNumber(b.minElev, 1)}–${formatNumber(b.maxElev, 1)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function profilePanelHtml(project: Project): string {
  return `
    <div class="profile-layout">
      <div class="profile-chart card">${renderProfileSvg(project.profile)}</div>
      <div class="profile-side">
        <button class="btn btn-primary" id="pick-profile">在三维中画剖面</button>
        <button class="btn" id="default-profile">生成贯穿剖面</button>
        <div class="section-divider"></div>
        ${project.profile ? `
          ${statCard('断面挖方面积', formatNumber(project.profile.cut, 1), 'm²')}
          <div style="height:12px"></div>
          ${statCard('断面填方面积', formatNumber(project.profile.fill, 1), 'm²')}
          <p class="help" style="margin-top:12px">在断面图上移动光标，三维视图会显示联动标记。</p>
        ` : `<p class="help">任意两点即可生成原地形与设计地形叠加断面，橙色为挖、蓝色为填。</p>`}
      </div>
    </div>`;
}
