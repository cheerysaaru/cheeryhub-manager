import { useMemo } from "react";
import {
  BarChart2,
  Flame,
  CheckCircle2,
  Target,
  Brain,
  Trophy,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useAnalytics } from "../hooks/useAnalytics";
import { usePoints } from "../hooks/usePoints";
import { useTasks } from "../hooks/useTasks";
import { useHabits } from "../hooks/useHabits";
import { useFocus } from "../hooks/useFocus";
import { Card } from "../components/Card";
import { Progress } from "../components/Progress";
import { Badge } from "../components/Badge";
import { parseLocalDate, formatShortDate } from "../utils/date";
import { pointsBreakdown } from "../utils/points";
import { reasonLabel } from "../../../shared/points";
import { ApiLoadError } from "../components/ApiLoadError";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const {
    stats,
    streak,
    loading,
    error: analyticsError,
    fetchAnalytics,
  } = useAnalytics(user?.id ?? null);
  const {
    points,
    error: pointsError,
    refresh: refreshPoints,
  } = usePoints(user?.id ?? null);
  const { tasks, error: tasksError, fetchTasks } = useTasks(user?.id ?? null);
  const {
    habits,
    error: habitsError,
    fetchHabits,
  } = useHabits(user?.id ?? null, user?.timezone);
  const {
    sessions,
    error: focusError,
    fetchSessions,
  } = useFocus(user?.id ?? null);
  const error =
    analyticsError ?? pointsError ?? tasksError ?? habitsError ?? focusError;
  const retry = () =>
    void Promise.all([
      fetchAnalytics(),
      refreshPoints(),
      fetchTasks(),
      fetchHabits(),
      fetchSessions(),
    ]);

  const totalXP = points?.currentTotal ?? 0;
  const level = points?.level ?? 1;
  const xpInLevel = points?.pointsIntoLevel ?? 0;
  const pointsNeeded = points?.pointsNeededForNextLevel ?? 100;
  const toNextLevel = pointsNeeded - xpInLevel;
  const totalTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const totalHabits = habits.reduce((s, h) => s + h.completedDays, 0);
  const totalFocus = sessions
    .filter((s) => s.status === "COMPLETED")
    .reduce((s, x) => s + x.durationMinutes, 0);
  const pointEvents = useMemo(() => points?.events ?? [], [points]);
  const recentPoints = useMemo(() => pointEvents.slice(0, 10), [pointEvents]);
  const breakdown = useMemo(() => pointsBreakdown(pointEvents), [pointEvents]);
  const earned = points?.totalEarned ?? 0;
  const lost = points?.totalLost ?? 0;

  const last14 = stats.slice(-14);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>Your progress at a glance</h1>
        </div>
      </header>

      <ApiLoadError error={error} onRetry={retry} />
      <div className="stats-grid analytics-stats">
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">
              <Flame size={16} /> Level
            </span>
            <div className="stat-value-row">
              <strong>{level}</strong>
            </div>
            <Progress
              value={xpInLevel}
              max={pointsNeeded}
              showLabel
              label={`${xpInLevel} / ${pointsNeeded} to level ${level + 1}`}
            />
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">
              <Target size={16} /> Total Points
            </span>
            <div className="stat-value-row">
              <strong>{totalXP}</strong>
            </div>
            <p className="stat-desc">{toNextLevel} to next level</p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">
              <Trophy size={16} /> Streak
            </span>
            <div className="stat-value-row">
              <strong>{streak?.current ?? 0}</strong>
            </div>
            <p className="stat-desc">
              Best: {streak?.best ?? 0} day{streak?.best === 1 ? "" : "s"}
            </p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">
              <CheckCircle2 size={16} /> Tasks Completed
            </span>
            <div className="stat-value-row">
              <strong>{totalTasks}</strong>
            </div>
            <p className="stat-desc">All time · {totalHabits} habit days</p>
          </div>
        </Card>
        <Card padding="md">
          <div className="stat-card">
            <span className="stat-label">
              <Brain size={16} /> Focus Minutes
            </span>
            <div className="stat-value-row">
              <strong>{totalFocus}</strong>
            </div>
            <p className="stat-desc">Deep work total</p>
          </div>
        </Card>
      </div>

      <section className="panel" aria-labelledby="trend-heading">
        <div className="panel-header">
          <div>
            <h2 id="trend-heading">Daily Productivity</h2>
            <p className="panel-subtitle">
              Last {last14.length} days with recorded stats
            </p>
          </div>
        </div>
        {loading ? (
          <div className="page-loading">Loading analytics…</div>
        ) : last14.length === 0 ? (
          <div className="empty-state">
            <BarChart2 size={32} />
            <strong>No stats yet</strong>
            <p>Stats appear as you complete tasks and habits.</p>
          </div>
        ) : (
          <div
            className="bar-chart"
            role="img"
            aria-label="Productivity over the last days"
          >
            {last14.map((day) => (
              <div
                key={day.id}
                className="bar-col"
                title={`${parseLocalDate(day.date).toLocaleDateString()}: ${day.productivityPercentage}%`}
              >
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ height: `${day.productivityPercentage}%` }}
                  />
                </div>
                <span className="bar-label">
                  {parseLocalDate(day.date).getDate()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="points-heading">
        <div className="panel-header">
          <div>
            <h2 id="points-heading">Level & Points</h2>
            <p className="panel-subtitle">How your points break down</p>
          </div>
        </div>
        {breakdown.length === 0 ? (
          <div className="empty-state">
            <Flame size={32} />
            <strong>No points yet</strong>
            <p>Complete tasks and commitments to earn points.</p>
          </div>
        ) : (
          <>
            <div className="points-summary">
              <span className="points-summary-item earned">
                <TrendingUp size={15} /> {earned} earned
              </span>
              <span className="points-summary-item spent">
                <TrendingDown size={15} /> {lost} lost
              </span>
              <span className="points-summary-item net">
                <strong>{totalXP}</strong> net
              </span>
            </div>
            <ul className="xp-list">
              {breakdown.map((entry) => (
                <li key={entry.label} className="xp-item">
                  <Badge variant={entry.amount > 0 ? "success" : "danger"}>
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount}
                  </Badge>
                  <span className="xp-reason">{entry.label}</span>
                  <span className="xp-date">
                    {entry.count} event{entry.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="xp-heading">
        <div className="panel-header">
          <div>
            <h2 id="xp-heading">Recent activity</h2>
            <p className="panel-subtitle">Your latest point events</p>
          </div>
        </div>
        {recentPoints.length === 0 ? (
          <div className="empty-state">
            <Flame size={32} />
            <strong>No points yet</strong>
            <p>Complete tasks and commitments to earn points.</p>
          </div>
        ) : (
          <ul className="xp-list">
            {recentPoints.map((item) => (
              <li key={item.id} className="xp-item">
                <Badge variant={item.amount > 0 ? "success" : "danger"}>
                  {item.amount > 0 ? "+" : ""}
                  {item.amount}
                </Badge>
                <span className="xp-reason">{reasonLabel(item.reason)}</span>
                <span className="xp-date">{formatShortDate(item.dayKey)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
