import {
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
  /** Optional inline action, e.g. an Undo button for reversible changes. */
  action?: ToastAction;
}

interface Toast extends ToastOptions {
  id: string;
  /** Content fingerprint: repeats replace the running toast instead of stacking. */
  dedupeKey: string;
}

export type ToastFn = (toast: ToastOptions) => string;

interface ToastContextType {
  toast: ToastFn;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

/** Never more than this many toasts on screen at once. */
const MAX_VISIBLE = 3;
/** Default lifetime: about four seconds. */
const DEFAULT_DURATION = 4000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paused, setPaused] = useState(false);
  const toastsRef = useRef<Toast[]>([]);
  const timersRef = useRef<Map<string, Timer>>(new Map());
  const pausedRef = useRef(false);
  const idRef = useRef(0);

  const commit = useCallback((next: Toast[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const stopTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timersRef.current.delete(id);
  }, []);

  const startTimer = useCallback((id: string, ms: number) => {
    const previous = timersRef.current.get(id);
    if (previous?.handle) clearTimeout(previous.handle);
    const timer: Timer = { handle: null, remaining: ms, startedAt: 0 };
    timersRef.current.set(id, timer);
    // While the pointer is over the stack the countdown is held.
    if (pausedRef.current) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ms);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      stopTimer(id);
      setToasts((prev) => {
        const next = prev.filter((t) => t.id !== id);
        toastsRef.current = next;
        return next;
      });
    },
    [stopTimer],
  );

  const toast = useCallback<ToastFn>(
    (t) => {
      const dedupeKey = `${t.type}|${t.title}|${t.message ?? ""}`;
      const duration = t.duration === 0 ? 0 : (t.duration ?? DEFAULT_DURATION);

      const existing = toastsRef.current.find(
        (item) => item.dedupeKey === dedupeKey,
      );
      idRef.current += 1;
      const id = existing?.id ?? `toast-${idRef.current}`;
      const entry: Toast = { ...t, id, dedupeKey };

      // The repeated toast is refreshed in place (newest first, max 3 shown).
      const without = toastsRef.current.filter(
        (item) => item.dedupeKey !== dedupeKey,
      );
      commit([entry, ...without].slice(0, MAX_VISIBLE));

      if (duration > 0) startTimer(id, duration);
      else stopTimer(id);
      return id;
    },
    [commit, startTimer, stopTimer],
  );

  // Pause/resume every countdown while the pointer rests on the stack.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      timersRef.current.forEach((timer, id) => {
        if (timer.handle) {
          clearTimeout(timer.handle);
          timer.handle = null;
        }
        const elapsed = timer.startedAt ? Date.now() - timer.startedAt : 0;
        timer.remaining = Math.max(0, timer.remaining - elapsed);
        timer.startedAt = 0;
        timersRef.current.set(id, timer);
      });
      return;
    }
    timersRef.current.forEach((timer, id) => {
      if (timer.handle !== null || timer.remaining <= 0) return;
      timer.startedAt = Date.now();
      timer.handle = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timer.remaining);
    });
  }, [paused]);

  // Drop every pending timer if the provider unmounts.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => {
        if (timer.handle) clearTimeout(timer.handle);
      });
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismiss}
        onPause={() => setPaused(true)}
        onResume={() => setPaused(false)}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

function ToastContainer({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const icons = {
    success: <CheckCircle className="toast-icon-success" size={20} />,
    error: <AlertCircle className="toast-icon-error" size={20} />,
    warning: <AlertTriangle className="toast-icon-warning" size={20} />,
    info: <Info className="toast-icon-info" size={20} />,
  };

  const bgClasses = {
    success: "toast-success",
    error: "toast-error",
    warning: "toast-warning",
    info: "toast-info",
  };

  return (
    <div
      className="toast-container"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      onPointerEnter={onPause}
      onPointerLeave={onResume}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${bgClasses[toast.type]}`}
          role="alert"
        >
          <div className="toast-icon">{icons[toast.type]}</div>
          <div className="toast-content">
            <p className="toast-title">{toast.title}</p>
            {toast.message && <p className="toast-message">{toast.message}</p>}
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <style>{`
        .toast-container {
          position: fixed;
          top: calc(env(safe-area-inset-top, 0px) + 16px);
          right: 16px;
          bottom: auto;
          left: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 1100;
          width: min(360px, calc(100vw - 32px));
        }
        .toast {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          animation: toastIn 0.25s ease;
        }
        .toast-success { background: #f0fdf4; border-color: #bbf7d0; }
        .toast-error { background: #fef2f2; border-color: #fecaca; }
        .toast-warning { background: #fffbeb; border-color: #fde68a; }
        .toast-info { background: #eff6ff; border-color: #bfdbfe; }
        .toast-icon-success { color: #16a34a; }
        .toast-icon-error { color: #dc2626; }
        .toast-icon-warning { color: #d97706; }
        .toast-icon-info { color: #2563eb; }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .toast-icon { flex-shrink: 0; margin-top: 2px; }
        .toast-content { flex: 1; min-width: 0; }
        .toast-title { margin: 0 0 4px; font-weight: 600; color: var(--text); }
        .toast-message { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
        .toast-action {
          display: inline;
          margin: 6px 0 0;
          padding: 0;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1.4;
          color: var(--primary, #2f855a);
          background: none;
          border: none;
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
        }
        .toast-action:hover { color: var(--text); }
        .toast-close { flex-shrink: 0; padding: 4px; color: var(--text-muted); background: none; border: none; border-radius: 4px; cursor: pointer; }
        .toast-close:hover { background: rgba(0,0,0,0.05); color: var(--text); }
        @media (max-width: 640px) {
          .toast-container {
            top: calc(env(safe-area-inset-top, 0px) + 12px);
            right: auto;
            left: 50%;
            transform: translateX(-50%);
            width: calc(100vw - 24px);
            max-width: 420px;
          }
          .toast { animation: toastInCenter 0.25s ease; }
          @keyframes toastInCenter {
            from { opacity: 0; transform: translateY(-16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        }
      `}</style>
    </div>
  );
}
