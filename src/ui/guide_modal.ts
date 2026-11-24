import { store } from '../store.ts';
import { openModal } from './controls.ts';
import { icons } from './icons.ts';
import type { GuideLine, LineKind, Project } from '../types.ts';
import { uid } from '../lib/math.ts';
import { getViewer } from './viewer_host.ts';
import { rampSlope } from '../webgl/colors.ts';
import { autoGenerateGuides, computeHydrology } from '../lib/hydrology.ts';

const W = 920;
const H = 560;

export function openGuideEditor(onChanged?: () => void) {
  const current = store.current;
  if (!current || !current.terrain || !current.slope) {
    store.setToast('请先导入或生成地形', 'error');
    return;
  }
  const project: Project = current;

  const { body } = openModal('排水沟 / 步道平面编辑', `
    <div class="guide-editor">
      <div class="guide-toolbar">
        <button class="btn btn-primary btn-sm" data-tool="drain">${icons.water}手绘排水沟</button>
        <button class="btn btn-sm" data-tool="path">手绘步道</button>
        <button class="btn btn-sm" id="finish-line">完成线</button>
        <button class="btn btn-sm" id="auto-guides">沿最大坡度自动生成</button>
        <button class="btn btn-danger btn-sm" id="delete-line">删除选中</button>
        <span class="help" id="guide-mode">选择、拖动顶点，或手绘后双击/完成。</span>
      </div>
      <div class="guide-main">
        <canvas id="guide-canvas" width="${W}" height="${H}"></canvas>
        <aside class="guide-list" id="guide-list"></aside>
      </div>
    </div>
  `);

  const canvas = body.querySelector<HTMLCanvasElement>('#guide-canvas')!;
  const ctx = canvas.getContext('2d')!;
  let tool: LineKind | 'select' = 'select';
  let draft: Array<{ x: number; z: number }> = [];
  let selectedId: string | null = project.lines[0]?.id ?? null;
  let drag: { id: string; index: number } | null = null;

  const bounds = getBounds(project);
  const scale = Math.min((W - 90) / bounds.width, (H - 70) / bounds.depth);
  const mapX = (x: number) => 45 + (x - bounds.minX) * scale;
  const mapY = (z: number) => 35 + (z - bounds.minZ) * scale;
  const world = (mx: number, my: number) => ({ x: bounds.minX + (mx - 45) / scale, z: bounds.minZ + (my - 35) / scale });

  const terrainPreview = document.createElement('canvas');
  terrainPreview.width = 240;
  terrainPreview.height = 160;
  const previewCtx = terrainPreview.getContext('2d')!;
  const img = previewCtx.createImageData(terrainPreview.width, terrainPreview.height);
  for (let y = 0; y < terrainPreview.height; y++) {
    for (let x = 0; x < terrainPreview.width; x++) {
      const gx = Math.floor((x / terrainPreview.width) * (project.terrain!.cols - 1));
      const gz = Math.floor((y / terrainPreview.height) * (project.terrain!.rows - 1));
      const c = rampSlope(project.slope!.slopeDeg[gz * project.terrain!.cols + gx]);
      const k = (y * terrainPreview.width + x) * 4;
      img.data[k] = c[0] * 255; img.data[k + 1] = c[1] * 255; img.data[k + 2] = c[2] * 255; img.data[k + 3] = 255;
    }
  }
  previewCtx.putImageData(img, 0, 0);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(terrainPreview, 45, 35, bounds.width * scale, bounds.depth * scale);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.strokeRect(45, 35, bounds.width * scale, bounds.depth * scale);

    for (const line of project.lines) {
      const selected = line.id === selectedId;
      ctx.beginPath();
      line.points.forEach((p, i) => i ? ctx.lineTo(mapX(p.x), mapY(p.z)) : ctx.moveTo(mapX(p.x), mapY(p.z)));
      ctx.strokeStyle = line.kind === 'drain' ? '#38bdf8' : '#fbbf24';
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.stroke();
      if (selected) {
        for (const p of line.points) {
          ctx.beginPath();
          ctx.arc(mapX(p.x), mapY(p.z), 5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
        }
      }
    }

    if (draft.length) {
      ctx.beginPath();
      draft.forEach((p, i) => i ? ctx.lineTo(mapX(p.x), mapY(p.z)) : ctx.moveTo(mapX(p.x), mapY(p.z)));
      ctx.strokeStyle = tool === 'drain' ? '#7dd3fc' : '#fde68a';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      draft.forEach((p) => {
        ctx.beginPath();
        ctx.arc(mapX(p.x), mapY(p.z), 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      });
    }
    paintList();
  }

  function paintList() {
    const list = body.querySelector<HTMLElement>('#guide-list')!;
    list.innerHTML = project.lines.map((l) => `
      <button class="guide-item ${l.id === selectedId ? 'active' : ''}" data-id="${l.id}">
        <span class="dot ${l.kind}"></span>
        <span><strong>${l.name}</strong><small>${l.points.length} 点${l.catchmentArea ? ` · 汇水 ${(l.catchmentArea / 666.67).toFixed(1)} 亩` : ''}</small></span>
      </button>`).join('') || '<p class="help">还没有线。</p>';
    list.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((btn) => btn.addEventListener('click', () => {
      selectedId = btn.dataset.id!;
      draw();
    }));
  }

  function eventWorld(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    return world(mx, my);
  }

  function hitVertex(wp: { x: number; z: number }) {
    for (const line of project.lines) {
      for (let i = 0; i < line.points.length; i++) {
        if (Math.hypot(mapX(line.points[i].x) - mapX(wp.x), mapY(line.points[i].z) - mapY(wp.z)) < 9) {
          return { id: line.id, index: i };
        }
      }
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const wp = eventWorld(e);
    if (tool === 'drain' || tool === 'path') {
      draft.push(wp);
      draw();
      return;
    }
    const hit = hitVertex(wp);
    if (hit) {
      selectedId = hit.id;
      drag = hit;
      canvas.setPointerCapture(e.pointerId);
      draw();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const line = project.lines.find((l) => l.id === drag!.id);
    if (!line) return;
    line.points[drag.index] = eventWorld(e);
    draw();
    getViewer()?.refreshOverlays();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag) {
      drag = null;
      store.scheduleSave();
      onChanged?.();
    }
  });
  canvas.addEventListener('dblclick', finishDraft);

  function finishDraft() {
    if (draft.length < 2 || (tool !== 'drain' && tool !== 'path')) return;
    const line: GuideLine = {
      id: uid('guide'),
      kind: tool,
      name: tool === 'drain' ? `排水沟 ${project.lines.filter((l) => l.kind === 'drain').length + 1}` : `步道 ${project.lines.filter((l) => l.kind === 'path').length + 1}`,
      points: draft,
      width: tool === 'drain' ? 0.8 : 1.5,
      catchmentArea: tool === 'drain' ? catchmentAt(project, draft[draft.length - 1]) : undefined
    };
    project.lines.push(line);
    selectedId = line.id;
    draft = [];
    tool = 'select';
    store.scheduleSave();
    getViewer()?.refreshOverlays();
    onChanged?.();
    draw();
  }

  body.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => btn.addEventListener('click', () => {
    tool = btn.dataset.tool as LineKind;
    draft = [];
    body.querySelector('#guide-mode')!.textContent = tool === 'drain' ? '沿汇水线/最大坡度点击控制点，双击完成。' : '沿最大坡度或之字形点击控制点，双击完成。';
    draw();
  }));
  body.querySelector('#finish-line')!.addEventListener('click', finishDraft);
  body.querySelector('#delete-line')!.addEventListener('click', () => {
    if (!selectedId) return;
    project.lines = project.lines.filter((l) => l.id !== selectedId);
    selectedId = null;
    store.scheduleSave();
    getViewer()?.refreshOverlays();
    onChanged?.();
    draw();
  });
  body.querySelector('#auto-guides')!.addEventListener('click', () => {
    if (!project.hydrology) project.hydrology = computeHydrology(project.terrain!);
    const lines = autoGenerateGuides(project.terrain!, project.slope!, project.hydrology!);
    project.lines = lines;
    selectedId = lines[0]?.id ?? null;
    store.scheduleSave();
    getViewer()?.refreshOverlays();
    onChanged?.();
    draw();
  });

  draw();
}

function getBounds(project: Project) {
  const t = project.terrain!;
  const minX = t.originX;
  const minZ = t.originZ;
  const width = (t.cols - 1) * t.cellX;
  const depth = (t.rows - 1) * t.cellZ;
  return { minX, minZ, width, depth };
}

function catchmentAt(project: Project, p: { x: number; z: number }): number {
  const h = project.hydrology;
  const t = project.terrain;
  if (!h || !t) return 0;
  const x = Math.round((p.x - t.originX) / t.cellX);
  const z = Math.round((p.z - t.originZ) / t.cellZ);
  return x >= 0 && x < t.cols && z >= 0 && z < t.rows ? h.accumulation[z * t.cols + x] : 0;
}
