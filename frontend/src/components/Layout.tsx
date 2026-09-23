import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Layout as LayoutIcon, Home, Target, Trophy, Brain, BookOpen, Bell, Settings, DollarSign, BarChart2, Briefcase, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/goals', label: 'Goals', icon: Target },
  { path: '/skills', label: 'Skills', icon: Trophy },
  { path: '/focus', label: 'Focus', icon: Brain },
  { path: '/journal', label: 'Journal', icon: BookOpen },
  { path: '/reminders', label: 'Reminders', icon: Bell },
  { path: '/analytics', label: 'Analytics', icon: BarChart2 },
  { path: '/brand', label: 'Brand', icon: Briefcase },
  { path: '/finance', label: 'Finance', icon: DollarSign },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
  };

  if (loading) return <div className="app-loading-screen"><div className="spinner" /><p>Loading…</p></div>;
  if (!user) return <Outlet />;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Link to="/" className="logo">
            <LayoutIcon size={28} />
            <span>Productivity</span>
          </Link>
        </div>
        <nav className={`app-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <ul>
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
            <li>
              <button className="nav-link logout-btn" onClick={handleLogout}>
                <LogOut size={20} />
                <span>Log out</span>
              </button>
            </li>
          </ul>
        </nav>
        <div className="header-right">
          <span className="user-name">{user.name}</span>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <style>{`
        .app-layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 6px 16px;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mobile-menu-btn {
          display: none;
          width: 44px;
          height: 44px;
          border: none;
          background: transparent;
          color: var(--text);
          border-radius: 8px;
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: var(--text);
          font-weight: 800;
          font-size: 0.95rem;
        }
        .app-nav ul {
          display: flex;
          align-items: center;
          gap: 4px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .nav-link {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: 8px;
          font-weight: 600;
          font-size: 12px;
          text-decoration: none;
          min-height: 44px;
          height: 44px;
        }
        .nav-link svg {
          width: 16px;
          height: 16px;
        }
        .nav-link:hover {
          background: var(--bg-hover);
          color: var(--text);
        }
        .nav-link.active {
          background: var(--primary);
          color: white;
        }
        .nav-link.active svg {
          stroke: white;
        }
        .logout-btn {
          color: var(--danger);
        }
        .logout-btn:hover {
          background: var(--danger-bg);
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .user-name {
          font-weight: 600;
          font-size: 12px;
          color: var(--text);
        }
        .app-main {
          flex: 1;
          padding: 16px 20px;
          width: min(1200px, 100%);
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .mobile-menu-btn {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .app-nav {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 300px;
            max-width: 85vw;
            background: var(--bg-card);
            border-left: 1px solid var(--border);
            padding: 80px 24px 24px;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            z-index: 200;
          }
          .app-nav.open {
            transform: translateX(0);
          }
          .app-nav ul {
            flex-direction: column;
            align-items: stretch;
          }
          .nav-link {
            justify-content: flex-start;
            padding: 10px 12px;
            font-size: 14px;
            height: auto;
            min-height: 44px;
          }
          .nav-link svg {
            width: 18px;
            height: 18px;
          }
          .app-main {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
}