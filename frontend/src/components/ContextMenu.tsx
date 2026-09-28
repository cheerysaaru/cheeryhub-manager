import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2 } from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  label: string;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
}

let ignoreCloseUntil = 0;

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const openAt = useCallback((x: number, y: number, label: string) => {
    ignoreCloseUntil = Date.now() + 600;
    setMenu({ x, y, label });
    window.getSelection()?.removeAllRanges();
  }, []);

  const open = useCallback((event: React.MouseEvent, label: string) => {
    event.preventDefault();
    event.stopPropagation();
    openAt(event.clientX, event.clientY, label);
  }, [openAt]);

  const close = useCallback(() => setMenu(null), []);

  const bind = useCallback((label: string) => ({
    'data-context-menu': '',
    onContextMenu: (event: React.MouseEvent) => open(event, label),
    onTouchEnd: (event: React.TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      const now = Date.now();
      const x = touch.clientX;
      const y = touch.clientY;
      const last = lastTapRef.current;
      const isDoubleTap =
        last &&
        now - last.time < 350 &&
        Math.abs(x - last.x) < 30 &&
        Math.abs(y - last.y) < 30;
      if (isDoubleTap) {
        lastTapRef.current = null;
        event.preventDefault();
        openAt(x, y, label);
        return;
      }
      lastTapRef.current = { time: now, x, y };
    },
  }), [open, openAt]);

  return { menu, open, close, bind };
}

export function ContextMenu({ state, onClose, onEdit, onDelete, editLabel = 'Edit', deleteLabel = 'Delete' }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: Event) => {
      if (Date.now() < ignoreCloseUntil) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  const menuWidth = 180;
  const menuHeight = onEdit ? 96 : 52;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(state.y, window.innerHeight - menuHeight - 8);

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={`Actions for ${state.label}`}
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
    >
      <p className="context-menu-title" title={state.label}>{state.label}</p>
      {onEdit && (
        <button type="button" className="context-menu-item" role="menuitem" onClick={() => { onEdit(); onClose(); }}>
          <Pencil size={15} />
          {editLabel}
        </button>
      )}
      <button type="button" className="context-menu-item danger" role="menuitem" onClick={() => { onDelete(); onClose(); }}>
        <Trash2 size={15} />
        {deleteLabel}
      </button>
    </div>,
    document.body
  );
}
