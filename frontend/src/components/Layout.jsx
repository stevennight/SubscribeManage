/**
 * App shell: fixed sidebar on desktop, slide-over drawer on mobile.
 */
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

const NAV = [
  { to: '/', end: true, icon: 'fas fa-layer-group', label: '订阅列表' },
  { to: '/reports', icon: 'fas fa-chart-column', label: '报表统计' },
  { to: '/settings', icon: 'fas fa-gear', label: '系统设置' },
];

export default function Layout({ theme, setTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer on navigation (deferred to dodge set-state-in-effect).
  useEffect(() => {
    const t = window.setTimeout(() => setDrawerOpen(false), 0);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  const path = location.pathname;
  const current =
    NAV.find((item) => (item.end ? path === item.to : path.startsWith(item.to)))
    || (path.startsWith('/subscriptions') ? NAV[0] : null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <div className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setDrawerOpen(true)} aria-label="打开菜单">
          <i className="fas fa-bars" />
        </button>
        <div className="sidebar-brand">{current?.label || 'SubscribeManage'}</div>
      </div>

      {drawerOpen && <div className="sidebar-overlay" onClick={() => setDrawerOpen(false)} />}

      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <i className="fas fa-layer-group" />
          SubscribeManage
        </div>

        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <i className={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
          >
            <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          </button>
          <span className="spacer" />
          <button className="icon-btn" onClick={handleLogout} title="退出登录">
            <i className="fas fa-arrow-right-from-bracket" />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
