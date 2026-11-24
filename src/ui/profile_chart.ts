import type { ProfileLine } from '../types.ts';
import { formatNumber } from '../lib/math.ts';
import { getViewer } from './viewer_host.ts';

const W = 900;
const H = 260;
const PAD_L = 54;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 34;

export function renderProfileSvg(profile: ProfileLine | null): string {
  if (!profile || profile.samples.length < 2) {
    return `<div class="card empty-state"><div class="empty-icon">剖面</div><h3>还没有剖面线</h3><p>点击“三维画剖面”后，在地形上点两个点。</p></div>`;
  }
  const s = profile.samples;
  const maxD = s[s.length - 1].distance || 1;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of s) {
    minY = Math.min(minY, p.original, p.designed);
    maxY = Math.max(maxY, p.original, p.designed);
  }
  const pad = Math.max(0.6, (maxY - minY) * 0.12);
  minY -= pad;
  maxY += pad;
  const x = (d: number) => PAD_L + (d / maxD) * (W - PAD_L - PAD_R);
  const y = (v: number) => H - PAD_B - ((v - minY) / (maxY - minY || 1)) * (H - PAD_T - PAD_B);
  const line = (key: 'original' | 'designed') => s.map((p, i) => `${i ? 'L' : 'M'}${x(p.distance).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  const band = (cut: boolean) => {
    let d = '';
    let active = false;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i];
      const b = s[i + 1];
      const da = a.original - a.designed;
      const db = b.original - b.designed;
      const isCut = da + db >= 0;
      if (isCut !== cut || Math.abs(da + db) < 1e-9) {
        if (active) {
          d += ` L${x(a.distance).toFixed(1)},${y(a.designed).toFixed(1)}`;
          const rev = [...s.slice(Math.max(0, i - 1), i + 1)].reverse();
          for (const p of rev) d += ` L${x(p.distance).toFixed(1)},${y(p.designed).toFixed(1)}`;
          d += ' Z';
          active = false;
        }
        continue;
      }
      if (!active) {
        d += `M${x(a.distance).toFixed(1)},${y(a.original).toFixed(1)}`;
        active = true;
      }
      d += ` L${x(b.distance).toFixed(1)},${y(b.original).toFixed(1)}`;
    }
    if (active) d += ' Z';
    return d;
  };

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = minY + ((maxY - minY) * i) / ticks;
    const yy = y(v);
    return `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${yy}" y2="${yy}" stroke="#e2e8f0"/>
      <text x="${PAD_L - 8}" y="${yy + 4}" text-anchor="end" font-size="14" fill="#64748b">${formatNumber(v, 1)}</text>`;
  }).join('');

  return `
  <svg id="profile-svg" viewBox="0 0 ${W} ${H}" class="profile-svg" preserveAspectRatio="xMidYMid meet">
    ${grid}
    <path d="${band(true)}" fill="rgba(234,88,12,.28)" stroke="none"></path>
    <path d="${band(false)}" fill="rgba(37,99,235,.22)" stroke="none"></path>
    <path d="${line('original')}" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"></path>
    <path d="${line('designed')}" fill="none" stroke="#15803d" stroke-width="2.6" vector-effect="non-scaling-stroke"></path>
    <line id="profile-hover-line" x1="0" x2="0" y1="${PAD_T}" y2="${H - PAD_B}" stroke="#0f172a" stroke-opacity=".25" stroke-width="1"></line>
    <circle id="profile-hover-dot" r="5" fill="#f59e0b" stroke="#fff" stroke-width="2" visibility="hidden"></circle>
    <text x="${PAD_L}" y="${H - 10}" font-size="14" fill="#64748b">0 m</text>
    <text x="${W - PAD_R}" y="${H - 10}" text-anchor="end" font-size="14" fill="#64748b">${formatNumber(maxD, 1)} m</text>
  </svg>`;
}

export function bindProfileHover(container: HTMLElement, profile: ProfileLine | null) {
  const svg = container.querySelector<SVGSVGElement>('#profile-svg');
  if (!svg || !profile) return;
  const line = svg.querySelector<SVGLineElement>('#profile-hover-line')!;
  const dot = svg.querySelector<SVGCircleElement>('#profile-hover-dot')!;

  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const maxD = profile.samples[profile.samples.length - 1].distance;
    const d = Math.max(0, Math.min(maxD, ((px - PAD_L) / (W - PAD_L - PAD_R)) * maxD));
    let best = profile.samples[0];
    for (const p of profile.samples) if (Math.abs(p.distance - d) < Math.abs(best.distance - d)) best = p;
    const x = PAD_L + (best.distance / maxD) * (W - PAD_L - PAD_R);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of profile.samples) { minY = Math.min(minY, p.original, p.designed); maxY = Math.max(maxY, p.original, p.designed); }
    const pad = Math.max(.6, (maxY - minY) * .12);
    minY -= pad; maxY += pad;
    const yy = H - PAD_B - ((best.designed - minY) / (maxY - minY)) * (H - PAD_T - PAD_B);
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(yy));
    dot.setAttribute('visibility', 'visible');
    getViewer()?.setMarker([best.x, best.designed + 1, best.z]);
  });
  svg.addEventListener('pointerleave', () => {
    dot.setAttribute('visibility', 'hidden');
    getViewer()?.setMarker(null);
  });
}
