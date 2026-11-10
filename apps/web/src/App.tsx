import { useEffect } from 'react';
import { go, loadProjects, useStore, getState, type Route } from './store';
import { useT, type TKey } from './i18n';
import { Dashboard } from './views/Dashboard';
import { Editor } from './views/Editor';
import { LibraryPage, ReportsPage, SettingsPage } from './views/Pages';

const NAV: { key: TKey; route?: Route['page']; icon: string; ready: boolean }[] = [
  { key: 'dashboard', route: 'dashboard', icon: '⌂', ready: true },
  { key: 'floorPlans', route: 'editor', icon: '▦', ready: true },
  { key: 'library', route: 'library', icon: '🛋', ready: true },
  { key: 'reports', route: 'reports', icon: '▤', ready: true },
  { key: 'estimates', icon: '₪', ready: false },
  { key: 'team', icon: '👥', ready: false },
  { key: 'settings', route: 'settings', icon: '⚙', ready: true },
];

function routeFromHash(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const m = h.match(/^project\/([\w-]+)/);
  if (m) return { page: 'editor', projectId: m[1] };
  if (h === 'library' || h === 'reports' || h === 'settings') return { page: h };
  return { page: 'dashboard' };
}

export function App() {
  const { t, dir, lang } = useT();
  const route = useStore((s) => s.route);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const project = useStore((s) => s.project);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
  }, [dir, lang, theme]);

  useEffect(() => {
    loadProjects().then(() => {
      const r = routeFromHash();
      if (r.page === 'editor' && !getState().projects.some((p) => p.id === r.projectId)) go({ page: 'dashboard' });
      else go(r);
    });
  }, []);

  return (
    <div className="app">
      <nav className="nav" aria-label="main">
        <div className="brand" title="PlanForge Studio"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M3 3h12v6h6v12H3z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9 3v8H3M15 15h6" stroke="currentColor" strokeWidth="2" /></svg><span>PlanForge</span></div>
        {NAV.map((n) => {
          const active = n.route === route.page;
          const disabled = !n.ready || (n.route === 'editor' && !project);
          return (
            <button key={n.key} className={`nav-item ${active ? 'on' : ''}`} disabled={disabled} data-testid={`nav-${n.key}`}
              title={!n.ready ? t('notImplemented') : t(n.key)}
              onClick={() => { if (n.route === 'editor' && project) go({ page: 'editor', projectId: project.id }); else if (n.route && n.route !== 'editor') go({ page: n.route } as Route); }}>
              <span className="ni">{n.icon}</span><span className="nl">{t(n.key)}</span>{!n.ready && <small className="soon">—</small>}
            </button>
          );
        })}
      </nav>
      <main className="main">
        {route.page === 'dashboard' && <Dashboard />}
        {route.page === 'editor' && <Editor />}
        {route.page === 'library' && <LibraryPage />}
        {route.page === 'reports' && <ReportsPage />}
        {route.page === 'settings' && <SettingsPage />}
      </main>
      {toast && <div className={`toast ${toast.kind}`} role="status" data-testid="toast">{toast.text}</div>}
    </div>
  );
}
