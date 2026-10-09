import { useEffect, useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Avatar } from "./Avatar";
import { GreetingPopup } from "./GreetingPopup";
import { NotificationCenter } from "./NotificationCenter";
import { adminItems, isActiveNavPath, navItems } from "./navItems";
import {
  getDisplayName,
  getProfilePic,
  PROFILE_EVENT,
  initAvatar,
} from "../utils/profile";

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState(() =>
    getDisplayName(user?.name ?? ""),
  );
  const [profilePic, setProfilePic] = useState(() => getProfilePic());

  const [prevUserName, setPrevUserName] = useState(user?.name);
  if (user?.name !== prevUserName) {
    setPrevUserName(user?.name);
    setProfileName(getDisplayName(user?.name ?? ""));
  }

  useEffect(() => {
    initAvatar();
  }, [user]);

  useEffect(() => {
    const onProfileUpdated = () => {
      setProfileName(getDisplayName(user?.name ?? ""));
      setProfilePic(getProfilePic());
    };
    window.addEventListener(PROFILE_EVENT, onProfileUpdated);
    return () => window.removeEventListener(PROFILE_EVENT, onProfileUpdated);
  }, [user]);
  const visibleNavItems =
    user?.role === "ADMIN" ? [...navItems, ...adminItems] : navItems;

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
  };

  if (loading)
    return (
      <div className="app-loading-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  if (!user) return <Outlet />;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Link to="/" className="logo">
            <span>cheeryhub</span>
          </Link>
        </div>
        <nav className={`app-nav ${mobileMenuOpen ? "open" : ""}`}>
          <div className="nav-drawer-head">
            <span className="nav-drawer-title">Menu</span>
            <button
              type="button"
              className="nav-drawer-close"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
              <span>Close</span>
            </button>
          </div>
          <ul>
            {visibleNavItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`nav-link ${isActiveNavPath(location.pathname, item.path) ? "active" : ""}`}
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
          <NotificationCenter userId={user.id} />
          <Avatar
            size="md"
            className="nav-avatar"
            name={profileName || user?.name || "?"}
            src={profilePic}
            alt={profileName}
          />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <GreetingPopup username={profileName || user?.name || "there"} />
      <style>{`
        .app-layout {
          min-height: 100dvh;
          min-height: 100svh;
          display: flex;
          flex-direction: column;
        }
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: clamp(6px, 1.5vh, 10px) clamp(12px, 3vw, 24px);
          background: var(--bg-card);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 100;
          padding-top: max(clamp(6px, 1.5vh, 10px), env(safe-area-inset-top));
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
          font-weight: 600;
          font-size: 0.95rem;
        }
        .nav-drawer-head {
          display: none;
        }
        .app-nav ul {
          display: flex;
          align-items: center;
          gap: 4px;
          list-style: none;
          margin: 0;
          padding: 0;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .app-nav ul::-webkit-scrollbar {
          display: none;
        }
        .nav-link {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: 999px;
          font-weight: 500;
          font-size: 13px;
          text-decoration: none;
          min-height: 36px;
          height: 36px;
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
          color: var(--primary-fg);
        }
        .nav-link.active svg {
          stroke: var(--primary-fg);
        }
        .logout-btn {
          color: var(--danger);
        }
        .logout-btn:hover {
          background: var(--danger-bg);
          color: var(--danger);
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .user-name {
          font-weight: 600;
          font-size: 13px;
          color: var(--text);
        }
        .app-main {
          flex: 1;
          padding: clamp(12px, 2.5vh, 24px) clamp(16px, 4vw, 32px);
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          overflow-x: hidden;
        }
        @media (max-width: 1024px) {
          .app-main {
            padding: clamp(10px, 2vh, 16px) clamp(12px, 3vw, 20px);
          }
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
            left: 0;
            bottom: 0;
            width: 300px;
            max-width: 85vw;
            background: var(--bg);
            border-right: 1px solid var(--border);
            padding: 12px 16px 20px;
            padding-top: max(12px, env(safe-area-inset-top));
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 200;
            overflow-y: auto;
          }
          .app-nav.open {
            transform: translateX(0);
          }
          .nav-drawer-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 4px 12px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 10px;
          }
          .nav-drawer-title {
            color: var(--text);
            font-weight: 600;
            font-size: 14px;
          }
          .nav-drawer-close {
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 40px;
            padding: 8px 12px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: var(--text-muted);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
          }
          .nav-drawer-close:hover {
            background: var(--bg-hover);
            color: var(--text);
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
            border-radius: 8px;
          }
          .nav-link svg {
            width: 18px;
            height: 18px;
          }
          .app-main {
            padding: clamp(10px, 2vh, 16px) clamp(12px, 3vw, 20px);
          }
        }
      `}</style>
    </div>
  );
}
