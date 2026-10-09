import type { StreakInfo } from "../hooks/useAnalytics";

const RING_RADIUS = 27;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface HeaderStatsProps {
  streak: StreakInfo | null;
  totalXP: number;
  level: number;
  xpInLevel: number;
  /** Cost of the current level (ring denominator); defaults to 100. */
  pointsNeeded?: number;
  onOpenPoints: () => void;
}

/**
 * Dashboard header widgets: exactly one streak pill plus the round level
 * button that opens the points breakdown.
 */
export function HeaderStats({
  streak,
  totalXP,
  level,
  xpInLevel,
  pointsNeeded = 100,
  onOpenPoints,
}: HeaderStatsProps) {
  const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const streakTooltip = streak
    ? `Current streak: ${dayWord(streak.current)} · Best streak: ${dayWord(streak.best)}`
    : undefined;
  const toNext = Math.max(pointsNeeded - xpInLevel, 0);

  return (
    <div className="header-stats">
      {streak && (
        <div
          className={`streak-pill${streak.todayActive ? " is-active" : ""}`}
          title={streakTooltip}
          aria-label={streakTooltip}
        >
          <span className="streak-pill-label">Streak</span>
          <span className="streak-pill-count">{streak.current}</span>
          <span className="streak-pill-fire" aria-hidden="true">
            🔥
          </span>
        </div>
      )}
      <button
        type="button"
        className="level-badge"
        onClick={onOpenPoints}
        aria-haspopup="dialog"
        aria-label={`Level ${level}, ${totalXP} points. Open points breakdown`}
        title={`${totalXP} points · ${toNext} to level ${level + 1}`}
      >
        <svg
          className="level-ring"
          viewBox="0 0 64 64"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="level-ring-track"
            cx="32"
            cy="32"
            r={RING_RADIUS}
          />
          <circle
            className="level-ring-progress"
            cx="32"
            cy="32"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={
              RING_CIRCUMFERENCE *
              (1 -
                Math.min(Math.max(xpInLevel, 0), pointsNeeded) / pointsNeeded)
            }
          />
        </svg>
        <span className="level-inner">
          <span className="level-caption">LEVEL</span>
          <span className="level-number" key={level}>
            {level}
          </span>
        </span>
      </button>
    </div>
  );
}
