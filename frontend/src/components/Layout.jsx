/**
 * Main layout with sidebar navigation.
 */
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Layout({ theme, setTheme }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Mobile top bar + hamburger */}
      <div className="mobile-header">
        <div className="sidebar-brand">
          <i className="fas fa-layer-group"></i>
          <h1>SubscribeManage</h1>
        </div>
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
          <i className="fas fa-bars"></i>
        </button>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <i className="fas fa-layer-group"></i>
          <h1>SubscribeManage</h1>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end>
            <i className="fas fa-th-large"></i> 订阅列表
          </NavLink>
          <NavLink to="/reports">
            <i className="fas fa-chart-bar"></i> 报表统计
          </NavLink>
          <NavLink to="/settings">
            <i className="fas fa-cog"></i> 系统设置
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}>
            <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
          <button className="logout-btn" onClick={handleLogout} title="退出登录">
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
