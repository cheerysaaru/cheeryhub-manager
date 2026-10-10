import { StrictMode, lazy, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";
import { useAuth, AuthProvider } from "./hooks/useAuth";
import { syncPendingWrites } from "./services/api";
import { Layout } from "./components/Layout";
import {
  AppErrorBoundary,
  TabErrorBoundary,
} from "./components/AppErrorBoundary";
import { Button } from "./components/Button";
import { ToastProvider } from "./components/Toast";
import { getTheme, applyTheme } from "./utils/theme";
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ResetPage = lazy(() => import("./pages/ResetPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));

const TasksPage = lazy(() => import("./pages/TasksPage"));
const CommitmentsPage = lazy(() => import("./pages/CommitmentsPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const SkillsPage = lazy(() => import("./pages/SkillsPage"));
const ArchivedmentsPage = lazy(() => import("./pages/ArchivedmentsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const BrandPage = lazy(() => import("./pages/BrandPage"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

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
  if (user?.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return <AdminPage />;
}

applyTheme(getTheme());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error: unknown) =>
        console.warn("[service-worker] Registration failed:", error),
      );
  });
}

function App() {
  const { user, loading, authError, refreshUser } = useAuth();
  
  useEffect(() => {
    const syncWrites = () => {
      void syncPendingWrites().catch((error: unknown) => {
        console.error("[api] Could not sync pending writes:", error);
      });
    };
    syncWrites();
    const online = () => {
      void syncPendingWrites()
        .then(() => window.location.reload())
        .catch((error: unknown) =>
          console.error("[api] Could not sync pending writes:", error),
        );
    };
    const offline = () => {};
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
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
    if (authError) {
      return (
        <main role="alert" className="app-error-screen">
          <h1>Can't reach the server</h1>
          <p>{authError}</p>
          <Button type="button" onClick={() => void refreshUser()}>
            Retry
          </Button>
        </main>
      );
    }
    return (
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/reset" element={<ResetPage />} />
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <TabErrorBoundary name="Dashboard">
                <DashboardPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/tasks"
            element={
              <TabErrorBoundary name="Tasks">
                <TasksPage />
              </TabErrorBoundary>
            }
          />
          {/* History is the canonical commitments page; /commitments keeps old
              notification links (and refreshes) working. */}
          <Route
            path="/commitments/history"
            element={
              <TabErrorBoundary name="Commitments">
                <CommitmentsPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/commitments"
            element={<Navigate to="/commitments/history" replace />}
          />
          <Route
            path="/goals"
            element={
              <TabErrorBoundary name="Goals">
                <GoalsPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/skills"
            element={
              <TabErrorBoundary name="Skills">
                <SkillsPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/achievements"
            element={
              <TabErrorBoundary name="Achievements">
                <ArchivedmentsPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/archivedments"
            element={<Navigate to="/achievements" replace />}
          />
          {/* Removed tabs (Focus, Journal, Reminders) keep their old URLs but
              always land on the dashboard — the underlying data is untouched. */}
          <Route path="/focus" element={<Navigate to="/" replace />} />
          <Route path="/journal" element={<Navigate to="/" replace />} />
          <Route path="/reminders" element={<Navigate to="/" replace />} />
          <Route
            path="/analytics"
            element={
              <TabErrorBoundary name="Analytics">
                <AnalyticsPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/brand"
            element={
              <TabErrorBoundary name="Brand">
                <BrandPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/finance"
            element={
              <TabErrorBoundary name="Finance">
                <FinancePage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <TabErrorBoundary name="Settings">
                <SettingsPage />
              </TabErrorBoundary>
            }
          />
          <Route
            path="/admin"
            element={
              <TabErrorBoundary name="Admin">
                <AdminRoute />
              </TabErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
