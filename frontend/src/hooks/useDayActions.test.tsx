import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useDayActions } from './useDayActions';
import type { DayAction } from '../components/DayContextMenu';
import type { ToastFn, ToastOptions } from '../components/Toast';

function makeApi() {
  const call = vi.fn<(id: string, date?: string) => Promise<boolean>>(async () => true);
  return {
    complete: call,
    clearToday: vi.fn<(id: string, date?: string) => Promise<boolean>>(async () => true),
    failToday: vi.fn<(id: string, date?: string) => Promise<boolean>>(async () => true),
    skipToday: vi.fn<(id: string, date?: string) => Promise<boolean>>(async () => true),
  };
}

/** Renders a probe so the hook's callback can be captured outside React. */
function capture(api: ReturnType<typeof makeApi>, toast: ToastFn) {
  let run: ((habitId: string, date: string, action: DayAction) => Promise<boolean>) | undefined;
  function Probe() {
    run = useDayActions(api, toast);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return run!;
}

const TODAY = new Date();
function dayKey(offset: number): string {
  const date = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDayActions', () => {
  it('checks in today and offers Undo for 5 seconds', async () => {
    const api = makeApi();
    const toast = vi.fn();
    const run = capture(api, toast);

    const ok = await run('h1', dayKey(0), 'checkin');

    expect(ok).toBe(true);
    expect(api.complete).toHaveBeenCalledWith('h1', dayKey(0));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0].duration).toBe(5000);
    expect(toast.mock.calls[0][0].action?.label).toBe('Undo');
  });

  it('marks a PAST day and offers Undo for 5 seconds', async () => {
    const api = makeApi();
    const toast = vi.fn<(t: ToastOptions) => string>();
    const run = capture(api, toast);

    const ok = await run('h1', dayKey(-2), 'fail');

    expect(ok).toBe(true);
    expect(api.failToday).toHaveBeenCalledWith('h1', dayKey(-2));
    expect(toast).toHaveBeenCalledTimes(1);
    const options = toast.mock.calls[0][0];
    expect(options.duration).toBe(5000);
    expect(options.title).toBe('Marked as failed');
    expect(options.action?.label).toBe('Undo');
  });

  it('Undo action clears the very same day', async () => {
    const api = makeApi();
    const toast = vi.fn<(t: ToastOptions) => string>();
    const run = capture(api, toast);
    await run('h1', dayKey(-1), 'checkin');

    toast.mock.calls[0][0].action?.onClick();
    expect(api.clearToday).toHaveBeenCalledWith('h1', dayKey(-1));
  });

  it('marks leave on a past day with an undo toast', async () => {
    const api = makeApi();
    const toast = vi.fn<(t: ToastOptions) => string>();
    const run = capture(api, toast);

    await run('h1', dayKey(-1), 'leave');

    expect(api.skipToday).toHaveBeenCalledWith('h1', dayKey(-1));
    expect(toast.mock.calls[0][0].title).toBe('Marked as leave');
  });

  it('undo (clear) itself never shows another undo toast', async () => {
    const api = makeApi();
    const toast = vi.fn();
    const run = capture(api, toast);

    const ok = await run('h1', dayKey(-2), 'undo');

    expect(ok).toBe(true);
    expect(api.clearToday).toHaveBeenCalledWith('h1', dayKey(-2));
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows no toast when the server rejects the change (rollback path)', async () => {
    const api = makeApi();
    api.complete.mockResolvedValue(false);
    const toast = vi.fn();
    const run = capture(api, toast);

    const ok = await run('h1', dayKey(-3), 'checkin');

    expect(ok).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
});
