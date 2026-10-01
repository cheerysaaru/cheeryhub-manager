import { StrictMode, lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import { useAuth, AuthProvider } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { syncPendingWrites } from './services/api';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { getTheme, applyTheme } from './utils/theme';
import AuthPage from './pages/AuthPage';
import ResetPage from './pages/ResetPage';
import DashboardPage from './pages/DashboardPage';

const TasksPage = lazy(() => import('./pages/TasksPage'));
const CommitmentsPage = lazy(() => import('./pages/CommitmentsPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const SkillsPage = lazy(() => import('./pages/SkillsPage'));
const ArchivedmentsPage = lazy(() => import('./pages/ArchivedmentsPage'));
const FocusPage = lazy(() => import('./pages/FocusPage'));
const JournalPage = lazy(() => import('./pages/JournalPage'));
const RemindersPage = lazy(() => import('./pages/RemindersPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const BrandPage = lazy(() => import('./pages/BrandPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function PageLoading() {
  return (
    <div className="app-loading-screen">
      <div className="spinner" />
      <p>Loading…</p>
    </div>
  );
}

function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <AdminPage />;
}

applyTheme(getTheme());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
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
        <Route path="/reset" element={<ResetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/reset" element={<ResetPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          {/* History is the canonical commitments page; /commitments keeps old
              notification links (and refreshes) working. */}
          <Route path="/commitments/history" element={<CommitmentsPage />} />
          <Route path="/commitments" element={<Navigate to="/commitments/history" replace />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/achievements" element={<ArchivedmentsPage />} />
          <Route path="/archivedments" element={<Navigate to="/achievements" replace />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/brand" element={<BrandPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>
);