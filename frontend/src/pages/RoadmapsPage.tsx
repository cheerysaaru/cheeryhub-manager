import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Map,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  MoreVertical,
  Pencil,
  Trash2,
  Sparkles,
  ListChecks,
  Bell,
  XCircle,
  Clock,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useRoadmaps } from "../hooks/useRoadmaps";
import { useGoals } from "../hooks/useGoals";
import { useSkills } from "../hooks/useSkills";
import { usePoints } from "../hooks/usePoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Progress } from "../components/Progress";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Input } from "../components/Input";
import { ApiLoadError } from "../components/ApiLoadError";
import { useToast } from "../components/Toast";
import { Select } from "../components/Select";
import { Textarea } from "../components/Textarea";
import { todayISO } from "../utils/date";

interface RoadmapDay {
  id: string;
  dayNumber: number;
  learnTopic: string;
  buildTask: string;
  heading: string | null;
  description: string | null;
  whatILearned: string | null;
  status: "PENDING" | "DONE" | "MISSED" | string;
  dueAt: string | null;
  completed: boolean;
  completedAt: string | null;
}

interface Roadmap {
  id: string;
  title: string;
  description?: string;
  totalDays: number;
  completedDays?: number;
  days?: RoadmapDay[];
  skillId?: string | null;
  goalId?: string | null;
  mode?: "AI" | "MANUAL" | string;
  startDate?: string | null;
  reminderEnabled?: number | boolean;
  completed?: boolean;
}

interface DayPlan {
  heading: string;
  description: string;
}

const emptyPlans = (count: number): DayPlan[] =>
  Array.from({ length: count }, () => ({ heading: "", description: "" }));

export default function RoadmapsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { roadmaps, loading, error, fetchRoadmaps, createRoadmap, completeDay, deleteRoadmap, updateRoadmap, generatePlan } = useRoadmaps(user?.id ?? null);
  const { goals, fetchGoals } = useGoals(user?.id ?? null);
  const { skills, fetchSkills } = useSkills(user?.id ?? null);
  const { points, refresh: refreshPoints } = usePoints(user?.id ?? null);

  const [showForm, setShowForm] = useState(false);
  const [expandedRoadmapId, setExpandedRoadmapId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingRoadmapId, setDeletingRoadmapId] = useState<string | null>(null);
  const [deletedRoadmapTitle, setDeletedRoadmapTitle] = useState<string | null>(null);
  const [showKebab, setShowKebab] = useState<string | null>(null);
  const kebabRef = useRef<HTMLDivElement>(null);

  // Create form state
  const [formMode, setFormMode] = useState<"AI" | "MANUAL">("AI");
  const [formTitle, setFormTitle] = useState("");
  const [formDays, setFormDays] = useState(30);
  const [formSkillId, setFormSkillId] = useState<string | null>(null);
  const [formGoalId, setFormGoalId] = useState<string | null>(null);
  const [formReminder, setFormReminder] = useState(true);
  const [dayPlans, setDayPlans] = useState<DayPlan[]>(emptyPlans(30));
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Edit state
  const [editingRoadmapId, setEditingRoadmapId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSkillId, setEditSkillId] = useState<string | null>(null);
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [editReminder, setEditReminder] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  // Day draft state
  const [dayDrafts, setDayDrafts] = useState<Record<string, DayPlan & { whatILearned?: string }>>({});
  const [busyDayId, setBusyDayId] = useState<string | null>(null);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchRoadmaps();
    void fetchGoals();
    void fetchSkills();
    void refreshPoints();
  }, [fetchRoadmaps, fetchGoals, fetchSkills, refreshPoints]);

  useEffect(() => {
    if (!showKebab) return;
    const handler = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) setShowKebab(null);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowKebab(null);
    };
    document.addEventListener("click", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [showKebab]);

  // Browser notification on load
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const today = todayISO();
    const key = `roadmap-reminded:${today}`;
    if (sessionStorage.getItem(key)) return;
    const todays: Array<{ roadmap: Roadmap; day: RoadmapDay }> = [];
    for (const roadmap of roadmaps as Roadmap[]) {
      for (const day of (roadmap.days ?? [])) {
        if (!day.completed && (day.dueAt ?? "").slice(0, 10) === today) {
          todays.push({ roadmap, day });
        }
      }
    }
    if (todays.length === 0) return;
    sessionStorage.setItem(key, "1");
    todays.slice(0, 3).forEach(({ roadmap, day }) => {
      new Notification(`Roadmap: ${roadmap.title}`, {
        body: day.heading || day.learnTopic || `Day ${day.dayNumber} is waiting for you.`,
        tag: `roadmap-${roadmap.id}-${day.id}`,
      });
    });
  }, [roadmaps]);

  const resetForm = useCallback(() => {
    setFormMode("AI");
    setFormTitle("");
    setFormDays(30);
    setFormSkillId(null);
    setFormGoalId(null);
    setFormReminder(true);
    setDayPlans(emptyPlans(30));
    setAiSource(null);
    setAiError(null);
    setFormError(null);
    setShowMore(false);
  }, []);

  const openForm = useCallback(() => { resetForm(); setShowForm(true); }, [resetForm]);

  const setDaysAndResize = useCallback((days: number) => {
    setFormDays(days);
    setDayPlans((plans) =>
      Array.from({ length: days }, (_, index) => plans[index] ?? { heading: "", description: "" }),
    );
    setAiSource(null);
    setAiError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    setAiError(null);
    const title = formTitle.trim();
    if (!title || title.length < 2) {
      setAiError("Enter a roadmap title first");
      return;
    }
    setGenerating(true);
    try {
      const result = await generatePlan(title, formDays);
      if (result?.days) {
        setDayPlans(result.days.map((day) => ({ heading: day.heading, description: day.description })));
        setAiSource(result.source === "ai" ? "AI-generated" : "AI unavailable â€” starter plan");
      }
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : "Could not generate the plan";
      if (msg.includes("reach") || msg.includes("connection")) {
        setAiError("Server unreachable. Check your internet and try again.");
      } else {
        setAiError(msg);
      }
      // Always populate fallback on error so user can still create
      setDayPlans(emptyPlans(formDays));
      setAiSource("Error â€” editing starter plan");
    } finally {
      setGenerating(false);
    }
  }, [formTitle, formDays, generatePlan]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const title = formTitle.trim();
    if (!title || title.length < 2 || title.length > 80) {
      setFormError("Title must be 2-80 characters");
      return;
    }
    if (!Number.isInteger(formDays) || formDays < 1 || formDays > 90) {
      setFormError("Days must be 1-90");
      return;
    }
    if (formMode === "MANUAL") {
      for (const [i, plan] of dayPlans.entries()) {
        if (!plan.heading.trim() || !plan.description.trim()) {
          setFormError(`Day ${i + 1} needs a heading and description`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      await createRoadmap({
        title,
        totalDays: formDays,
        mode: formMode,
        reminderEnabled: formReminder,
        days: dayPlans.map((plan) => ({
          heading: plan.heading.trim(),
          description: plan.description.trim(),
        })),
        skillId: formSkillId,
        goalId: formGoalId,
      });
      setShowForm(false);
      resetForm();
      await refreshPoints();
      toast({ type: "success", title: "Roadmap created", message: "Your daily plan is ready" });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Failed to create roadmap");
    } finally {
      setSubmitting(false);
    }
  }, [formTitle, formDays, dayPlans, formMode, formReminder, formSkillId, formGoalId, createRoadmap, resetForm, refreshPoints, toast]);

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    const title = editTitle.trim();
    if (!title || title.length < 2 || title.length > 80) {
      setEditError("Title must be 2-80 characters");
      return;
    }
    try {
      await updateRoadmap({ id: editingRoadmapId, title, skillId: editSkillId, goalId: editGoalId, reminderEnabled: editReminder });
      setEditingRoadmapId(null);
      toast({ type: "success", title: "Roadmap updated", message: "Changes saved" });
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : "Failed to update roadmap");
    }
  }, [editingRoadmapId, editTitle, editSkillId, editGoalId, editReminder, updateRoadmap, toast]);

  const openEditModal = useCallback((roadmap: Roadmap) => {
    setEditingRoadmapId(roadmap.id);
    setEditTitle(roadmap.title);
    setEditSkillId(roadmap.skillId ?? null);
    setEditGoalId(roadmap.goalId ?? null);
    setEditReminder(roadmap.reminderEnabled !== 0 && roadmap.reminderEnabled !== false);
    setEditError(null);
    setShowKebab(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deletingRoadmapId) return;
    try {
      await deleteRoadmap(deletingRoadmapId);
      await refreshPoints();
      toast({ type: "success", title: "Roadmap deleted", message: "Roadmap deleted successfully" });
    } catch (caught) {
      toast({ type: "error", title: "Delete failed", message: caught instanceof Error ? caught.message : "Failed to delete roadmap" });
    } finally {
      setShowDeleteModal(false);
      setDeletingRoadmapId(null);
      setDeletedRoadmapTitle(null);
    }
  }, [deletingRoadmapId, deleteRoadmap, refreshPoints, toast]);

  const openDeleteModal = useCallback((roadmap: Roadmap) => {
    setDeletingRoadmapId(roadmap.id);
    setDeletedRoadmapTitle(roadmap.title);
    setShowDeleteModal(true);
    setShowKebab(null);
  }, []);

  const toggleRoadmap = useCallback((id: string) => setExpandedRoadmapId((prev) => (prev === id ? null : id)), []);
  const toggleDay = useCallback((dayId: string) => {
    setExpandedDayIds((prev) => {
      const n = new Set(prev);
      if (n.has(dayId)) n.delete(dayId); else n.add(dayId);
      return n;
    });
  }, []);

  const toggleDayDone = useCallback(async (roadmap: Roadmap, day: RoadmapDay) => {
    const draft = dayDrafts[day.id] ?? {
      heading: day.heading ?? day.learnTopic ?? "",
      description: day.description ?? day.buildTask ?? "",
      whatILearned: day.whatILearned ?? "",
    };
    if (!day.completed && roadmap.mode === "MANUAL" && (!draft.heading.trim() || !draft.description.trim())) {
      toast({ type: "warning", title: "Add today's details", message: "A heading and description are required before marking done." });
      setExpandedDayIds((prev) => new Set(prev).add(day.id));
      return;
    }
    setBusyDayId(day.id);
    try {
      await completeDay(roadmap.id, day.id, { completed: !day.completed, heading: draft.heading, description: draft.description, whatILearned: draft.whatILearned });
      setDayDrafts((prev) => { const n = { ...prev }; delete n[day.id]; return n; });
      await refreshPoints();
      toast({ type: "success", title: day.completed ? "Day undone" : "Day completed", message: day.completed ? "Points adjusted." : "Nice work â€” points added." });
    } catch (caught) {
      toast({ type: "error", title: "Could not update day", message: caught instanceof Error ? caught.message : "Please try again" });
    } finally { setBusyDayId(null); }
  }, [completeDay, dayDrafts, refreshPoints, toast]);

  const requestBrowserReminders = useCallback(async () => {
    if (!("Notification" in window)) { toast({ type: "error", title: "Not supported", message: "This browser has no notification support." }); return; }
    const permission = await Notification.requestPermission();
    if (permission === "granted") toast({ type: "success", title: "Daily reminders on", message: "You will get a notification for each day's task." });
    else toast({ type: "warning", title: "Reminders blocked", message: "Allow notifications in your browser to get daily reminders." });
  }, [toast]);

  const stats = useMemo(() => {
    const total = roadmaps.reduce((sum: number, r: Roadmap) => sum + (r.totalDays || 0), 0);
    const done = roadmaps.reduce((sum: number, r: Roadmap) => sum + (r.completedDays ?? (r.days ?? []).filter((d) => d.completed).length), 0);
    return { total, done };
  }, [roadmaps]);

  const isFormValid = formTitle.trim().length >= 2 && Number.isInteger(formDays) && formDays >= 1 && formDays <= 90;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">ROADMAPS</p>
          <h1>Learning roadmaps</h1>
          <p className="header-date">
            {stats.done}/{stats.total} days done
            {points ? ` Â· ${points.currentTotal} pts Â· Level ${points.level}` : ""}
          </p>
        </div>
        <div className="roadmap-header-actions">
          <Button variant="outline" onClick={() => void requestBrowserReminders()}><Bell size={18} /> Daily reminders</Button>
          <Button size="lg" onClick={openForm}><Plus size={20} /> Create Roadmap</Button>
        </div>
      </header>

      <ApiLoadError error={error} onRetry={() => void fetchRoadmaps()} />

      {loading ? (<div className="page-loading">Loading roadmaps...</div>)
      : roadmaps.length === 0 ? (
        <div className="empty-state">
          <Map size={40} /><strong>No roadmaps yet</strong>
          <p>Create your first roadmap â€” AI-generated or written by you.</p>
          <Button onClick={openForm}><Plus size={18} /> Create Roadmap</Button>
        </div>
      ) : (
        <div className="roadmaps-grid">
          {(roadmaps as Roadmap[]).map((roadmap) => {
            const days = roadmap.days ?? [];
            const total = roadmap.totalDays || days.length || 1;
            const completed = roadmap.completedDays ?? days.filter((d) => d.completed).length;
            const pct = Math.round((completed / total) * 100);
            const remaining = Math.max(0, total - completed);
            const isExpanded = expandedRoadmapId === roadmap.id;
            const missed = days.filter((d) => d.status === "MISSED").length;
            return (
              <Card key={roadmap.id} className={`roadmap-card ${isExpanded ? "is-open" : ""}`} padding="md">
                <div className="roadmap-card-wrapper">
                  <div className="roadmap-summary" role="button" tabIndex={0} aria-expanded={isExpanded}
                    onClick={() => toggleRoadmap(roadmap.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRoadmap(roadmap.id); } }}>
                    <ChevronDown size={18} className={`roadmap-expand-chevron ${isExpanded ? "open" : ""}`} aria-hidden="true" />
                    <div className="roadmap-title-section">
                      <strong>{roadmap.title}</strong>
                      <p className="roadmap-description">
                        {roadmap.mode === "MANUAL" ? "Manual plan" : "AI plan"}
                        {missed > 0 ? ` Â· ${missed} missed` : ""}
                      </p>
                    </div>
                    <div className="roadmap-progress">
                      <Progress value={pct} /><span className="progress-text">{pct}%</span>
                      <span className="days-text">{remaining} {remaining === 1 ? "day" : "days"} remaining</span>
                    </div>
                    {pct >= 100 ? <Badge variant="success" size="sm">Completed</Badge>
                      : missed > 0 ? <Badge variant="danger" size="sm">{missed} missed</Badge> : null}
                    <div className="roadmap-kebab-wrapper" onClick={(e) => e.stopPropagation()}>
                      <button className="kebab-icon" onClick={(e) => { e.stopPropagation(); setShowKebab(showKebab === roadmap.id ? null : roadmap.id); }} aria-label="Roadmap options">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="roadmap-timeline">
                      <div className="timeline-line" />
                      {days.map((day, index) => {
                        const draft = dayDrafts[day.id] ?? { heading: day.heading ?? day.learnTopic ?? "", description: day.description ?? day.buildTask ?? "", whatILearned: day.whatILearned ?? "" };
                        const isDayExpanded = expandedDayIds.has(day.id);
                        const isCurrent = !day.completed && days.findIndex((entry) => !entry.completed) === index;
                        const status = day.completed ? "completed" : day.status === "MISSED" ? "missed" : isCurrent ? "current" : "upcoming";
                        const dueLabel = day.dueAt ? new Date(day.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
                        return (
                          <div key={day.id} className="day-node-wrapper">
                            <button className={`day-node ${status}`} onClick={() => toggleDay(day.id)} aria-label={`Day ${day.dayNumber}: ${status}`}>
                              {day.completed ? <CheckCircle2 size={16} /> : day.status === "MISSED" ? <XCircle size={16} /> : <span className="node-number">{day.dayNumber}</span>}
                            </button>
                            <div className="day-card">
                              <header className="day-card-header" onClick={() => toggleDay(day.id)}>
                                <h3 className="day-title">Day {day.dayNumber}: {draft.heading || `Day ${day.dayNumber}`}</h3>
                                <div className="day-card-badges">
                                  {dueLabel && <span className="day-due"><Clock size={12} /> {dueLabel}</span>}
                                  <span className={`day-status-badge ${status}`}>{day.completed ? "done" : day.status === "MISSED" ? "not done" : isCurrent ? "in progress" : "upcoming"}</span>
                                </div>
                              </header>
                              {isDayExpanded ? (
                                <>
                                  <div className="day-sections-row">
                                    <div className="day-section-box learn">
                                      <label className="section-label">{roadmap.mode === "MANUAL" ? "WHAT I WORKED ON" : "LEARN"}</label>
                                      <Textarea value={draft.heading} onChange={(event) => setDayDrafts((prev) => ({ ...prev, [day.id]: { ...draft, heading: event.target.value } }))} rows={2} placeholder="Today's heading" disabled={day.completed} />
                                    </div>
                                    <div className="day-section-box build">
                                      <label className="section-label">{roadmap.mode === "MANUAL" ? "ONE-LINE SUMMARY" : "BUILD"}</label>
                                      <Textarea value={draft.description} onChange={(event) => setDayDrafts((prev) => ({ ...prev, [day.id]: { ...draft, description: event.target.value } }))} rows={2} placeholder="One line about what you did" disabled={day.completed} />
                                    </div>
                                  </div>
                                  <Textarea label="Notes" value={draft.whatILearned ?? ""} onChange={(event) => setDayDrafts((prev) => ({ ...prev, [day.id]: { ...draft, whatILearned: event.target.value } }))} placeholder={day.completed ? "Notes..." : "Reflect on what you learned..."} rows={2} />
                                  <div className="day-card-actions">
                                    {day.completed ? (
                                      <Button variant="ghost" size="sm" loading={busyDayId === day.id} onClick={() => void toggleDayDone(roadmap, day)}><RotateCcw size={14} /> Undo</Button>
                                    ) : (
                                      <Button variant={day.status === "MISSED" ? "danger" : "primary"} size="sm" loading={busyDayId === day.id} onClick={() => void toggleDayDone(roadmap, day)}><CheckCircle2 size={14} /> Mark done</Button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="compact-day-line" onClick={() => toggleDay(day.id)} role="button" tabIndex={0}>
                                  <ChevronRight size={14} />
                                  <span className="compact-day-text">
                                    {draft.description || draft.heading || "Open details"}
                                    {day.completed && <span className="compact-day-status"> Â· done</span>}
                                    {day.status === "MISSED" && <span className="compact-day-status missed"> Â· not done</span>}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showDeleteModal && (
        <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Roadmap">
          <p>Are you sure you want to delete "<strong>{deletedRoadmapTitle}</strong>"? Its points and achievement will be removed.</p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void handleDelete()}><Trash2 size={14} /> Delete</Button>
          </div>
        </Modal>
      )}

      {showKebab && (
        <div className="kebab-menu-overlay" onClick={() => setShowKebab(null)}>
          <div className="kebab-menu" ref={kebabRef} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" onClick={() => { const r = roadmaps.find((entry: Roadmap) => entry.id === showKebab); if (r) openEditModal(r); }}><Pencil size={14} /> Edit</Button>
            <Button variant="danger" onClick={() => { const r = roadmaps.find((entry: Roadmap) => entry.id === showKebab); if (r) openDeleteModal(r); }}><Trash2 size={14} /> Delete</Button>
          </div>
        </div>
      )}

      {editingRoadmapId && (
        <Modal isOpen onClose={() => setEditingRoadmapId(null)} title="Edit Roadmap">
          <form onSubmit={handleUpdate} className="modal-form">
            <Input label="Roadmap title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
            <Select label="Skill (optional)" value={editSkillId ?? ""} onChange={(event) => setEditSkillId(event.target.value || null)} options={[{ value: "", label: "None" }, ...((skills ?? []) as Array<{id:string;name:string}>).map((skill) => ({ value: skill.id, label: skill.name }))] } />
            <Select label="Goal (optional)" value={editGoalId ?? ""} onChange={(event) => setEditGoalId(event.target.value || null)} options={[{ value: "", label: "None" }, ...((goals ?? []) as Array<{id:string;title:string}>).map((goal) => ({ value: goal.id, label: goal.title }))] } />
            <label className="toggle-row">
              <span>
                <strong>Daily reminder</strong>
                <span className="toggle-desc">Get a notification every day for that day's task.</span>
              </span>
              <input type="checkbox" checked={editReminder} onChange={(e) => setEditReminder(e.target.checked)} className="toggle-input" />
              <span className="toggle-track" />
            </label>
            {editError && <p className="form-error">{editError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setEditingRoadmapId(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* CREATE MODAL */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }} title="Create Roadmap" size="md">
        <form onSubmit={handleCreate} className="create-roadmap-form">
          {/* Mode switch */}
          <div className="mode-switch" role="radiogroup" aria-label="Plan type">
            <button type="button" role="radio" aria-checked={formMode === "AI"} className={`mode-btn ${formMode === "AI" ? "active" : ""}`} onClick={() => setFormMode("AI")}>
              <Sparkles size={16} /><span>AI plan</span>
            </button>
            <button type="button" role="radio" aria-checked={formMode === "MANUAL"} className={`mode-btn ${formMode === "MANUAL" ? "active" : ""}`} onClick={() => setFormMode("MANUAL")}>
              <ListChecks size={16} /><span>Manual</span>
            </button>
          </div>

          {/* Title */}
          <Input label="Title / topic" value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required maxLength={80} placeholder="e.g., Learn JavaScript in 30 days" />

          {/* Days row */}
          <div className="days-row">
            <Input label="Days" type="number" min={1} max={90} value={formDays} onChange={(event) => setDaysAndResize(Math.max(1, Math.min(90, parseInt(event.target.value) || 1)))} required />
            <div className="day-chips-inline">
              {[7, 14, 30, 60].map((d) => (
                <button key={d} type="button" className={`day-chip-inline ${formDays === d ? "active" : ""}`} onClick={() => setDaysAndResize(d)}>{d}d</button>
              ))}
            </div>
          </div>

          {/* More options */}
          <div className="more-options">
            <button type="button" className="more-options-toggle" onClick={() => setShowMore((v) => !v)}>
              More options <ChevronDown size={14} className={showMore ? "open" : ""} />
            </button>
            {showMore && (
              <div className="more-options-content">
                <div className="form-row">
                  <Select label="Skill (optional)" value={formSkillId ?? ""} onChange={(event) => setFormSkillId(event.target.value || null)} options={[{ value: "", label: "None" }, ...((skills ?? []) as Array<{id:string;name:string}>).map((skill) => ({ value: skill.id, label: skill.name }))] } />
                  <Select label="Goal (optional)" value={formGoalId ?? ""} onChange={(event) => setFormGoalId(event.target.value || null)} options={[{ value: "", label: "None" }, ...((goals ?? []) as Array<{id:string;title:string}>).map((goal) => ({ value: goal.id, label: goal.title }))] } />
                </div>
                <label className="toggle-row">
                  <span>
                    <strong>Daily reminder</strong>
                    <span className="toggle-desc">Get a notification every day for that day's task.</span>
                  </span>
                  <input type="checkbox" checked={formReminder} onChange={(e) => setFormReminder(e.target.checked)} className="toggle-input" />
                  <span className="toggle-track" />
                </label>
              </div>
            )}
          </div>

          {/* Plan section */}
          {formMode === "AI" ? (
            <div className="ai-plan-section">
              {aiSource === null && !generating && (
                <>
                  <p className="ai-hint">We'll build a day-by-day plan for "<strong>{formTitle.trim() || "your topic"}</strong>".</p>
                  <Button type="button" variant="secondary" className="ai-generate-btn" loading={generating} onClick={() => void handleGenerate()}>
                    <Sparkles size={16} /> Generate with AI
                  </Button>
                  {aiError && (
                    <div className="ai-error">
                      <span>{aiError}</span>
                      <button type="button" onClick={() => void handleGenerate()}>Try again</button>
                    </div>
                  )}
                </>
              )}
              {generating && (
                <div className="ai-skeleton">
                  {Array.from({ length: Math.min(5, formDays) }).map((_, i) => (
                    <div key={i} className="skeleton-row"><span className="skeleton-badge">Day {i + 1}</span><div className="skeleton-line" /><div className="skeleton-line short" /></div>
                  ))}
                </div>
              )}
              {!generating && dayPlans.length > 0 && (
                <div className="ai-plan-review">
                  <div className="ai-plan-header">
                    <strong>Review the plan</strong>
                    <span className="ai-source-tag">{aiSource}</span>
                    <button type="button" className="ai-regenerate-btn" onClick={() => void handleGenerate()}><Sparkles size={14} /> Regenerate</button>
                  </div>
                  <div className="ai-plan-list">
                    {dayPlans.map((plan, i) => (
                      <div className="ai-day-row" key={i}>
                        <span className="ai-day-badge">Day {i + 1}</span>
                        <div className="ai-day-content">
                          <div className="ai-day-heading">{plan.heading || <em className="ai-placeholder">Heading</em>}</div>
                          {plan.description && <div className="ai-day-desc">{plan.description}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="manual-plan-section">
              <div className="manual-plan-header">
                <strong>Edit your plan</strong>
                <span className="manual-plan-hint">Fill headings and descriptions. You can also edit them later when marking days done.</span>
              </div>
              <div className="manual-plan-list">
                {dayPlans.map((plan, i) => (
                  <div className="manual-day-row" key={i}>
                    <span className="manual-day-label">Day {i + 1}</span>
                    <Input placeholder="Heading (e.g. Variables &amp; types)" value={plan.heading} onChange={(event) => setDayPlans((prev) => prev.map((p, j) => j === i ? { ...p, heading: event.target.value } : p))} />
                    <Input placeholder="One-line description" value={plan.description} onChange={(event) => setDayPlans((prev) => prev.map((p, j) => j === i ? { ...p, description: event.target.value } : p))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {formError && <p className="form-error">{formError}</p>}

          {/* Sticky footer */}
          <div className="modal-footer-sticky">
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button type="submit" disabled={!isFormValid || submitting} loading={submitting}>
              {submitting ? "Creating..." : "Create roadmap"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
