import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderStats } from './HeaderStats';
import type { HeaderStatsProps } from './HeaderStats';
import type { StreakInfo } from '../hooks/useAnalytics';

const streak: StreakInfo = { current: 3, best: 7, todayActive: true };

function render(props: Partial<HeaderStatsProps> = {}) {
  return renderToStaticMarkup(
    <HeaderStats
      streak={streak}
      totalXP={42}
      level={2}
      xpInLevel={42}
      onOpenPoints={() => undefined}
      {...props}
    />
  );
}

describe('HeaderStats', () => {
  it('renders exactly one streak pill', () => {
    const html = render();
    expect(html.match(/class="streak-pill[ "]/g) ?? []).toHaveLength(1);
    expect(html).toContain('streak-pill-count">3<');
  });

  it('renders no points pill and no pts / x-of-100 text', () => {
    const html = render();
    expect(html).not.toContain('xp-badge');
    expect(html).not.toContain('pts ·');
    expect(html).not.toContain('/100');
    expect(html).not.toContain('🔥'); // no emoji pill either
  });

  it('tooltips the current and best streak on the single pill', () => {
    const html = render();
    expect(html).toContain('Current streak: 3 days · Best streak: 7 days');
    expect(html.match(/Current streak/g) ?? []).toHaveLength(2); // title + aria-label
  });

  it('uses singular day wording for a one-day streak', () => {
    const html = render({ streak: { current: 1, best: 1, todayActive: false } });
    expect(html).toContain('Current streak: 1 day · Best streak: 1 day');
    expect(html).not.toContain(' is-active');
  });

  it('hides the pill entirely when there is no streak data', () => {
    const html = render({ streak: null });
    expect(html).not.toContain('streak-pill');
  });

  it('renders the level as an openable round button with an accessible name', () => {
    const html = render();
    expect(html.match(/class="level-badge"/g) ?? []).toHaveLength(1);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('Level 2, 42 points. Open points breakdown');
    expect(html).toContain('>LEVEL<');
    expect(html).toContain('>2<');
    expect(html).toContain('level-ring-progress');
  });

  it('draws the ring proportionally to the level progress', () => {
    const html = render({ xpInLevel: 42 });
    const circumference = 2 * Math.PI * 27;
    const offsetMatch = html.match(/stroke-dashoffset="([0-9.]+)"/);
    expect(offsetMatch).not.toBeNull();
    const offset = Number(offsetMatch![1]);
    expect(offset).toBeCloseTo(circumference * 0.58, 3);
  });

  it('clamps out-of-range progress instead of drawing a broken ring', () => {
    const html = render({ xpInLevel: 140 });
    const circumference = 2 * Math.PI * 27;
    const offsetMatch = html.match(/stroke-dashoffset="([0-9.]+)"/);
    expect(Number(offsetMatch![1])).toBeCloseTo(0, 3);
  });
});
