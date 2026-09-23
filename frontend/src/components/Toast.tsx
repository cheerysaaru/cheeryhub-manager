import { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toast: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const newToast = { ...t, id };
    setToasts((prev) => [...prev, newToast]);
    if (t.duration !== 0) {
      setTimeout(() => dismiss(id), t.duration ?? 4000);
    }
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const icons = {
    success: <CheckCircle className="toast-icon-success" size={20} />,
    error: <AlertCircle className="toast-icon-error" size={20} />,
    warning: <AlertTriangle className="toast-icon-warning" size={20} />,
    info: <Info className="toast-icon-info" size={20} />,
  };

  const bgClasses = {
    success: 'toast-success',
    error: 'toast-error',
    warning: 'toast-warning',
    info: 'toast-info',
  };

  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${bgClasses[toast.type]}`} role="alert">
          <div className="toast-icon">{icons[toast.type]}</div>
          <div className="toast-content">
            <p className="toast-title">{toast.title}</p>
            {toast.message && <p className="toast-message">{toast.message}</p>}
          </div>
          <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
      <style>{`
        .toast-container {
          position: fixed;
          bottom: 24px;
          right: 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          z-index: 1000;
          max-width: 400px;
        }
        .toast {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          animation: slideIn 0.3s ease;
        }
        .toast-success { background: #f0fdf4; border-color: #bbf7d0; }
        .toast-error { background: #fef2f2; border-color: #fecaca; }
        .toast-warning { background: #fffbeb; border-color: #fde68a; }
        .toast-info { background: #eff6ff; border-color: #bfdbfe; }
        .toast-icon-success { color: #16a34a; }
        .toast-icon-error { color: #dc2626; }
        .toast-icon-warning { color: #d97706; }
        .toast-icon-info { color: #2563eb; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        .toast-icon { flex-shrink: 0; margin-top: 2px; }
        .toast-content { flex: 1; min-width: 0; }
        .toast-title { margin: 0 0 4px; font-weight: 600; color: var(--text); }
        .toast-message { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
        .toast-close { flex-shrink: 0; padding: 4px; color: var(--text-muted); background: none; border: none; border-radius: 4px; cursor: pointer; }
        .toast-close:hover { background: rgba(0,0,0,0.05); color: var(--text); }
        @media (max-width: 480px) {
          .toast-container { left: 16px; right: 16px; bottom: 16px; max-width: none; }
        }
      `}</style>
    </div>
  );
}