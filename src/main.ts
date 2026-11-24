import './styles/tokens.css';
import './styles/components.css';
import './styles/pages.css';
import { store } from './store.ts';
import { icons } from './ui/icons.ts';
import { renderProjects } from './ui/projects_page.ts';
import { renderTerrainPage } from './ui/terrain_page.ts';
import { renderTerracePage } from './ui/terrace_page.ts';
import { renderRowsPage } from './ui/rows_page.ts';
import { renderSeasonPage } from './ui/season_page.ts';
import { renderSettingsPage } from './ui/settings_page.ts';
import { disposeViewer } from './ui/viewer_host.ts';
import type { PageKey } from './types.ts';

const nav: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: 'projects', label: '项目列表', icon: icons.projects },
  { key: 'terrain', label: '地形导入', icon: icons.terrain },
  { key: 'terrace', label: '梯田设计', icon: icons.terrace },
  { key: 'rows', label: '茶行布置', icon: icons.rows },
  { key: 'season', label: '季相预览', icon: icons.season },
  { key: 'settings', label: '设置与校核', icon: icons.settings }
];

function shell() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${icons.terrace}</div>
          <div><div class="brand-title">云脊茶园</div><div class="brand-sub">Terrace Studio · WebGL2</div></div>
        </div>
        <nav class="nav">
          ${nav.map((n) => `<button class="nav-item" data-route="${n.key}">${n.icon}<span>${n.label}</span></button>`).join('')}
        </nav>
        <div class="sidebar-foot">
          挖填方亚格子校核<br />十万株实例化茶树<br />等高线 · 汇流 · 剖面联动
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1 id="top-title">项目列表</h1>
            <div class="topbar-meta" id="top-meta">山地新开茶园梯田规划与三维预览系统</div>
          </div>
          <div class="topbar-actions" id="top-actions"></div>
        </header>
        <section class="content" id="page-root"></section>
      </main>
    </div>
    <div id="toast-root"></div>
  `;

  app.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route as PageKey;
      if (route !== 'projects' && !store.current) {
        window.location.hash = '#/projects';
        return;
      }
      store.navigate(route);
    });
  });
}

function renderRoute() {
  const root = document.querySelector<HTMLElement>('#page-root');
  if (!root) return;
  disposeViewer();
  const route = store.route;
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.getAttribute('data-route') === route));
  const currentNav = nav.find((n) => n.key === route);
  document.querySelector('#top-title')!.textContent = currentNav?.label ?? '项目列表';
  const meta = document.querySelector('#top-meta')!;
  const actions = document.querySelector<HTMLElement>('#top-actions')!;
  actions.innerHTML = '';

  if (route === 'projects') {
    meta.textContent = '项目增删改、导入导出与方案管理';
    renderProjects(root);
    return;
  }

  const p = store.current;
  if (!p) {
    window.location.hash = '#/projects';
    return;
  }
  meta.textContent = `${p.name} · ${p.location} · ${p.terrain ? `${p.terrain.cols}×${p.terrain.rows}` : '尚未导入地形'}`;
  actions.innerHTML = `<button class="btn" id="save-project">${icons.save}保存</button><button class="btn btn-primary" id="back-projects">${icons.projects}项目</button>`;
  actions.querySelector('#save-project')?.addEventListener('click', () => store.saveNow());
  actions.querySelector('#back-projects')?.addEventListener('click', () => store.navigate('projects'));

  if (route === 'terrain') renderTerrainPage(root);
  if (route === 'terrace') renderTerracePage(root);
  if (route === 'rows') renderRowsPage(root);
  if (route === 'season') renderSeasonPage(root);
  if (route === 'settings') renderSettingsPage(root);
}

function renderToast() {
  const root = document.querySelector<HTMLElement>('#toast-root');
  if (!root) return;
  root.innerHTML = store.toast ? `<div class="toast ${store.toast.type}">${store.toast.text}</div>` : '';
}

store.subscribe(renderToast);
window.addEventListener('hashchange', () => {
  store.route = store.routeFromHash();
  renderRoute();
});

shell();
store.init()
  .then(renderRoute)
  .catch((err) => {
    console.error(err);
    renderRoute();
  });
