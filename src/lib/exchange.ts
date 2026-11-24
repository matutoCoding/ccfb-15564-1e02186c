import type { Project } from '../types.ts';

function typedToBase64(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeDeep(value: unknown): unknown {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const ctor = (value as { constructor: { name: string } }).constructor.name;
    return { __typedArray: ctor, base64: typedToBase64(value as ArrayBufferView) };
  }
  if (Array.isArray(value)) return value.map(encodeDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encodeDeep(v);
    return out;
  }
  return value;
}

function decodeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.__typedArray && typeof obj.base64 === 'string') {
      const bytes = base64ToBytes(obj.base64);
      switch (obj.__typedArray) {
        case 'Float32Array': return new Float32Array(bytes.buffer.slice(0));
        case 'Float64Array': return new Float64Array(bytes.buffer.slice(0));
        case 'Int32Array': return new Int32Array(bytes.buffer.slice(0));
        case 'Uint8Array': return bytes;
        case 'Uint32Array': return new Uint32Array(bytes.buffer.slice(0));
        default: return bytes;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decodeDeep(v);
    return out;
  }
  return value;
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ format: 'tea-terrace-project', version: 1, project: encodeDeep(project) }, null, 2);
}

export function deserializeProject(text: string): Project {
  const parsed = JSON.parse(text);
  const project = decodeDeep(parsed.project ?? parsed) as Project;
  if (!project.id || !project.name) throw new Error('项目文件缺少 id 或 name');
  return project;
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export function teaRowsCsv(project: Project): string {
  const rows = [['row_id', 'bench_id', 'sub_row_offset_cm', 'plant_index_in_row', 'x_m', 'y_m', 'z_m', 'variety']];
  if (!project.rows) return '﻿' + rows.map((r) => r.join(',')).join('\n');
  const subByRow = new Map(project.rows.rows.map((r) => [r.id, r.subIndex]));
  const indexByRow = new Map<number, number>();
  for (const p of project.rows.plants) {
    const plantIndex = (indexByRow.get(p.rowId) ?? 0) + 1;
    indexByRow.set(p.rowId, plantIndex);
    rows.push([
      String(p.rowId),
      String(p.benchId),
      String(subByRow.get(p.rowId) ?? 0),
      String(plantIndex),
      p.x.toFixed(3),
      p.y.toFixed(3),
      p.z.toFixed(3),
      project.rowParams.variety
    ]);
  }
  return '﻿' + rows.map((r) => r.join(',')).join('\n');
}

export function earthworkCsv(project: Project): string {
  const report = project.terrace?.volumes;
  const rows = [['bench_id', 'label', 'cut_m3', 'fill_m3', 'net_cut_minus_fill_m3', 'area_m2']];
  if (report) {
    for (const b of report.benches) {
      rows.push([
        String(b.benchId),
        b.label,
        b.cut.toFixed(2),
        b.fill.toFixed(2),
        b.net.toFixed(2),
        b.area.toFixed(1)
      ]);
    }
    rows.push([]);
    rows.push(['TOTAL', '总量', report.totalCut.toFixed(2), report.totalFill.toFixed(2), report.net.toFixed(2), '']);
    rows.push(['BALANCE_ERROR_PCT', '', report.balanceErrorPct.toFixed(4), '', '', '']);
  }
  return '﻿' + rows.map((r) => r.join(',')).join('\n');
}
