import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import { useAuth, AuthProvider } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { syncPendingWrites } from './services/api';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import GoalsPage from './pages/GoalsPage';
import SkillsPage from './pages/SkillsPage';
import FocusPage from './pages/FocusPage';
import JournalPage from './pages/JournalPage';
import RemindersPage from './pages/RemindersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import BrandPage from './pages/BrandPage';
import FinancePage from './pages/FinancePage';
import SettingsPage from './pages/SettingsPage';

const BASE_PATH = '/personal-productivity-manager';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${BASE_PATH}/sw.js`);
  });
}

function App() {
  const { user, loading } = useAuth();
  useSocket(user?.id ?? null);

  useEffect(() => {
    syncPendingWrites();
    const online = () => { syncPendingWrites(); window.location.reload(); };
    const offline = () => {};
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/focus" element={<FocusPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/brand" element={<BrandPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter basename={BASE_PATH}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>
);