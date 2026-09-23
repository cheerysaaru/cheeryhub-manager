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

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const open = useCallback((event: React.MouseEvent, label: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, label });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, close };
}

export function ContextMenu({ state, onClose, onEdit, onDelete, editLabel = 'Edit', deleteLabel = 'Delete' }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
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
