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
import { useTasks } from "../hooks/useTasks";
import { useHabits } from "../hooks/useHabits";
import { useFocus } from "../hooks/useFocus";
import { Card } from "../components/Card";
import { Progress } from "../components/Progress";
import { Badge } from "../components/Badge";
import { parseLocalDate } from "../utils/date";
import { levelFor, pointsIntoLevel, pointsToNextLevel } from "../utils/points";
import { xpBreakdown, xpEarnedSpent } from "../utils/xpBreakdown";
import { ApiLoadError } from "../components/ApiLoadError";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const {
    stats,
    xp,
    streak,
    loading,
    error: analyticsError,
    fetchAnalytics,
  } = useAnalytics(user?.id ?? null);
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
  const error = analyticsError ?? tasksError ?? habitsError ?? focusError;
  const retry = () =>
    void Promise.all([
      fetchAnalytics(),
      fetchTasks(),
      fetchHabits(),
      fetchSessions(),
    ]);

  const totalXP = xp?.total ?? 0;
  const level = levelFor(totalXP);
  const xpInLevel = pointsIntoLevel(totalXP);
  const totalTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const totalHabits = habits.reduce((s, h) => s + h.completedDays, 0);
  const totalFocus = sessions
    .filter((s) => s.status === "COMPLETED")
    .reduce((s, x) => s + x.durationMinutes, 0);
  const recentXp = (xp?.history ?? []).slice(0, 10);

  const breakdown = useMemo(() => xpBreakdown(xp?.history ?? []), [xp]);
  const { earned, spent } = useMemo(
    () => xpEarnedSpent(xp?.history ?? []),
    [xp],
  );

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
              max={100}
              showLabel
              label={`${xpInLevel} / 100 to level ${level + 1}`}
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
            <p className="stat-desc">
              {pointsToNextLevel(totalXP)} to next level
            </p>
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
                <TrendingDown size={15} /> {Math.abs(spent)} lost
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
            <h2 id="xp-heading">Recent XP</h2>
            <p className="panel-subtitle">Your latest rewards</p>
          </div>
        </div>
        {recentXp.length === 0 ? (
          <div className="empty-state">
            <Flame size={32} />
            <strong>No XP yet</strong>
            <p>Complete tasks and habits to earn XP.</p>
          </div>
        ) : (
          <ul className="xp-list">
            {recentXp.map((item) => (
              <li key={item.id} className="xp-item">
                <Badge variant={item.amount > 0 ? "success" : "danger"}>
                  {item.amount > 0 ? "+" : ""}
                  {item.amount}
                </Badge>
                <span className="xp-reason">{item.reason}</span>
                <span className="xp-date">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
