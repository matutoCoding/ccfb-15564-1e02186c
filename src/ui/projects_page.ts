import { store } from '../store.ts';
import { icons } from './icons.ts';
import { openModal } from './controls.ts';
import { projectStorage } from '../lib/storage.ts';
import { deserializeProject, downloadText, serializeProject } from '../lib/exchange.ts';
import type { Project } from '../types.ts';

export function renderProjects(root: HTMLElement) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h2 class="page-title">项目列表</h2>
        <p class="page-desc">管理茶园项目、导入导出完整方案；地形、梯田、茶行和三维设置都会保存在本机浏览器。</p>
      </div>
      <div class="row-actions">
        <button class="btn" id="import-project">${icons.upload}导入项目</button>
        <button class="btn btn-primary" id="new-project">${icons.plus}新建项目</button>
        <input type="file" id="project-file" accept=".json,application/json" hidden />
      </div>
    </div>
    <div class="grid grid-3 project-grid" id="project-grid"></div>
  `;

  const grid = root.querySelector<HTMLElement>('#project-grid')!;

  const paint = async () => {
    await store.refreshSummaries();
    if (!store.summaries.length) {
      grid.innerHTML = `
        <div class="card empty-state project-empty">
          <div class="empty-icon">${icons.terrain}</div>
          <h3>还没有茶园项目</h3>
          <p class="muted">新建一个项目，没有测绘文件时可以先生成一座带山脊沟谷的示例山头。</p>
          <button class="btn btn-primary" id="empty-new">${icons.plus}创建第一个项目</button>
        </div>`;
      grid.querySelector('#empty-new')?.addEventListener('click', openCreate);
      return;
    }

    grid.innerHTML = store.summaries.map((p) => `
      <article class="card project-card" data-id="${p.id}">
        <div class="project-card-top">
          <div class="project-icon">${icons.terrace}</div>
          <span class="badge ${p.hasTerrain ? 'badge-success' : 'badge-warning'}">${p.hasTerrain ? '已有地形' : '待导入地形'}</span>
        </div>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="muted project-location">${icons.projects}${escapeHtml(p.location || '未填写位置')}</p>
        <div class="project-meta">
          <span>负责人：${escapeHtml(p.owner || '--')}</span>
          <span>${p.plantCount ? `${p.plantCount.toLocaleString()} 株茶树` : '尚未布行'}</span>
        </div>
        <div class="project-time">更新于 ${new Date(p.updatedAt).toLocaleString('zh-CN')}</div>
        <div class="project-card-actions">
          <button class="btn btn-primary btn-sm" data-action="open">进入规划</button>
          <button class="btn btn-sm icon-btn" data-action="edit" title="编辑">${icons.edit}</button>
          <button class="btn btn-sm icon-btn" data-action="export" title="导出">${icons.download}</button>
          <button class="btn btn-sm icon-btn" data-action="copy" title="复制">${icons.copy}</button>
          <button class="btn btn-sm icon-btn danger" data-action="delete" title="删除">${icons.trash}</button>
        </div>
      </article>
    `).join('');

    grid.querySelectorAll<HTMLElement>('.project-card').forEach((card) => {
      const id = card.dataset.id!;
      card.addEventListener('click', async (e) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
        if (!button) {
          store.openProject(id);
          return;
        }
        const action = button.dataset.action;
        e.stopPropagation();
        if (action === 'open') store.openProject(id);
        if (action === 'edit') openEdit(id);
        if (action === 'copy') {
          await store.duplicateProject(id);
          paint();
        }
        if (action === 'delete') confirmDelete(id);
        if (action === 'export') exportOne(id);
      });
    });
  };

  const openCreate = () => projectForm(null, async (values) => {
    await store.createAndOpen(values);
  });

  root.querySelector('#new-project')!.addEventListener('click', openCreate);
  root.querySelector('#import-project')!.addEventListener('click', () => root.querySelector<HTMLInputElement>('#project-file')!.click());
  root.querySelector<HTMLInputElement>('#project-file')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const project = deserializeProject(await file.text());
      await store.importProject(project);
    } catch (err) {
      store.setToast(`导入失败：${(err as Error).message}`, 'error');
    }
  });

  paint();
}

function projectForm(project: Project | null, onSubmit: (values: { name: string; owner: string; location: string; areaMu: number }) => void) {
  const { body, close } = openModal(project ? '编辑项目信息' : '新建茶园项目', `
    <div class="field"><label>项目名称</label><input class="input" id="f-name" value="${escapeAttr(project?.name ?? '')}" placeholder="例如：云脊村东坡茶园" /></div>
    <div class="grid grid-2">
      <div class="field"><label>负责人</label><input class="input" id="f-owner" value="${escapeAttr(project?.owner ?? '')}" /></div>
      <div class="field"><label>面积（亩）</label><input class="input" id="f-area" type="number" min="0" step="0.1" value="${project?.areaMu ?? 0}" /></div>
    </div>
    <div class="field"><label>位置</label><input class="input" id="f-location" value="${escapeAttr(project?.location ?? '')}" placeholder="省市县/小地名" /></div>
    <div class="modal-actions"><button class="btn" data-cancel>取消</button><button class="btn btn-primary" id="f-submit">${project ? '保存' : '创建并进入'}</button></div>
  `);
  body.querySelector('[data-cancel]')?.addEventListener('click', close);
  const submit = body.querySelector<HTMLButtonElement>('#f-submit')!;
  submit.addEventListener('click', async () => {
    const values = {
      name: body.querySelector<HTMLInputElement>('#f-name')!.value.trim(),
      owner: body.querySelector<HTMLInputElement>('#f-owner')!.value.trim(),
      location: body.querySelector<HTMLInputElement>('#f-location')!.value.trim(),
      areaMu: Number(body.querySelector<HTMLInputElement>('#f-area')!.value) || 0
    };
    if (!values.name) {
      store.setToast('请先填写项目名称', 'error');
      return;
    }
    submit.disabled = true;
    try {
      await onSubmit(values);
      close();
    } catch (err) {
      submit.disabled = false;
      store.setToast(`创建失败：${(err as Error).message}`, 'error');
    }
  });
}

async function openEdit(id: string) {
  const project = await projectStorage.get(id);
  if (!project) return;
  projectForm(project, async (values) => {
    Object.assign(project, values);
    await projectStorage.save(project);
    await store.refreshSummaries();
    if (store.current?.id === id) {
      store.current.name = values.name;
      store.current.owner = values.owner;
      store.current.location = values.location;
      store.current.areaMu = values.areaMu;
      store.emit();
    }
    store.setToast('项目信息已保存', 'success');
  });
}

async function confirmDelete(id: string) {
  const summary = store.summaries.find((p) => p.id === id);
  if (!window.confirm(`确定删除「${summary?.name ?? '项目'}」吗？此操作会清除本机保存的完整方案。`)) return;
  await store.deleteProject(id);
  renderProjects(document.querySelector<HTMLElement>('#page-root')!);
}

async function exportOne(id: string) {
  const project = await projectStorage.get(id);
  if (!project) return;
  downloadText(`${project.name}-茶园方案.json`, serializeProject(project), 'application/json');
  store.setToast('项目文件已导出', 'success');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string) { return escapeHtml(s); }
