import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "../hooks/useNotifications";
import type { AppNotification } from "../types";
import { ApiLoadError } from "./ApiLoadError";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function NotificationCenter({ userId }: { userId: string | null }) {
  const {
    items,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markRead,
    markAllRead,
  } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleOpenItem = (notification: AppNotification) => {
    void markRead(notification.id);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  return (
    <div className="notification-center" ref={containerRef}>
      <button
        type="button"
        className={`notification-bell ${open ? "open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notification-panel"
          role="menu"
          aria-label="Notifications"
        >
          <div className="notification-panel-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notification-mark-all"
                onClick={() => void markAllRead()}
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          <ApiLoadError
            error={error}
            onRetry={() => void fetchNotifications()}
          />
          {loading ? (
            <p className="notification-empty">Loading notifications…</p>
          ) : error ? null : items.length === 0 ? (
            <p className="notification-empty">
              Nothing yet. Reminders show up here.
            </p>
          ) : items.length > 0 ? (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item ${item.readAt ? "read" : "unread"}`}
                    onClick={() => handleOpenItem(item)}
                    role="menuitem"
                  >
                    <span className="notification-dot" aria-hidden="true" />
                    <span className="notification-copy">
                      <strong>{item.title}</strong>
                      {item.body && <span>{item.body}</span>}
                      <small>{relativeTime(item.createdAt)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
