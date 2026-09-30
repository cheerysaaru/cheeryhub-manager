import { useCallback, useRef, useState } from 'react';

export const LONG_PRESS_MS = 600;

type LongPressOptions = { ms?: number };

/**
 * Fires `onLongPress` after a continuous press of ~600ms (mouse and touch),
 * exposing `pressing` so the caller can show visual feedback while charging.
 * The click that follows a completed long press is swallowed.
 */
export function useLongPress(onLongPress: () => void, options: LongPressOptions = {}) {
  const ms = options.ms ?? LONG_PRESS_MS;
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPressing(false);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== undefined && event.button !== 0) return;
      firedRef.current = false;
      setPressing(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        setPressing(false);
        callbackRef.current();
      }, ms);
    },
    [ms]
  );

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (firedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      firedRef.current = false;
    }
  }, []);

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      // Right-click and Android's long-press both surface as contextmenu.
      event.preventDefault();
      event.stopPropagation();
      if (firedRef.current) return;
      firedRef.current = true;
      clear();
      callbackRef.current();
    },
    [clear]
  );

  const handlers = {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu,
    onClickCapture,
  };

  return { pressing, handlers };
}
