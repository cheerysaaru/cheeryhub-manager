import { Flame } from 'lucide-react';
import { pointsToNextLevel } from '../utils/points';
import type { StreakInfo } from '../hooks/useAnalytics';

const RING_RADIUS = 27;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface HeaderStatsProps {
  streak: StreakInfo | null;
  totalXP: number;
  level: number;
  xpInLevel: number;
  onOpenPoints: () => void;
}

/**
 * Dashboard header widgets: exactly one streak pill plus the round level
 * button that opens the points breakdown.
 */
export function HeaderStats({ streak, totalXP, level, xpInLevel, onOpenPoints }: HeaderStatsProps) {
  const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const streakTooltip = streak
    ? `Current streak: ${dayWord(streak.current)} · Best streak: ${dayWord(streak.best)}`
    : undefined;

  return (
    <div className="header-stats">
      {streak && (
        <div
          className={`streak-pill${streak.todayActive ? ' is-active' : ''}`}
          title={streakTooltip}
          aria-label={streakTooltip}
        >
          <Flame size={16} aria-hidden="true" />
          <span className="streak-pill-count">{streak.current}</span>
        </div>
      )}
      <button
        type="button"
        className="level-badge"
        onClick={onOpenPoints}
        aria-haspopup="dialog"
        aria-label={`Level ${level}, ${totalXP} points. Open points breakdown`}
        title={`${totalXP} points · ${pointsToNextLevel(totalXP)} to level ${level + 1}`}
      >
        <svg className="level-ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle className="level-ring-track" cx="32" cy="32" r={RING_RADIUS} />
          <circle
            className="level-ring-progress"
            cx="32"
            cy="32"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - Math.min(Math.max(xpInLevel, 0), 100) / 100)}
          />
        </svg>
        <span className="level-inner">
          <span className="level-caption">LEVEL</span>
          <span className="level-number" key={level}>{level}</span>
        </span>
      </button>
    </div>
  );
}
