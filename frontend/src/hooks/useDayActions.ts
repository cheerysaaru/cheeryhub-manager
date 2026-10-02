import { useCallback } from 'react';
import { todayISO } from '../utils/date';
import { formatShortFullDate } from '../utils/commitmentCalendar';
import type { ToastFn } from '../components/Toast';
import type { DayAction } from '../components/DayContextMenu';

interface DayApi {
  complete: (id: string, date?: string) => Promise<boolean>;
  clearToday: (id: string, date?: string) => Promise<boolean>;
  failToday: (id: string, date?: string) => Promise<boolean>;
  skipToday: (id: string, date?: string) => Promise<boolean>;
}

const ACTION_TITLES: Record<Exclude<DayAction, 'undo'>, string> = {
  checkin: 'Checked in',
  fail: 'Marked as failed',
  leave: 'Marked as leave',
};

/**
 * Shared tap handler for commitment days: runs the optimistic day action and,
 * for PAST days, offers an Undo toast for ~5s afterwards.
 */
export function useDayActions(api: DayApi, toast: ToastFn) {
  const { complete, clearToday, failToday, skipToday } = api;

  return useCallback(
    async (habitId: string, date: string, action: DayAction): Promise<boolean> => {
      const isPast = date < todayISO();
      let ok: boolean;
      if (action === 'checkin') ok = await complete(habitId, date);
      else if (action === 'fail') ok = await failToday(habitId, date);
      else if (action === 'leave') ok = await skipToday(habitId, date);
      else ok = await clearToday(habitId, date);
      if (!ok) return false;

      if (isPast && action !== 'undo') {
        toast({
          type: 'info',
          title: ACTION_TITLES[action],
          message: formatShortFullDate(date),
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              void clearToday(habitId, date);
            },
          },
        });
      }
      return true;
    },
    [complete, clearToday, failToday, skipToday, toast]
  );
}
