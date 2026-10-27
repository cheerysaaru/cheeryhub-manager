import { useCallback, useEffect, useState, useRef } from "react";
import {
  Plus,
  Map,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useRoadmaps } from "../hooks/useRoadmaps";
import { useGoals } from "../hooks/useGoals";
import { useSkills } from "../hooks/useSkills";
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

export default function RoadmapsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { roadmaps, loading, error, fetchRoadmaps, createRoadmap, completeDay, deleteRoadmap, updateRoadmap } = useRoadmaps(user?.id ?? null);
  const { goals, fetchGoals } = useGoals(user?.id ?? null);
  const { skills, fetchSkills } = useSkills(user?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [expandedRoadmapId, setExpandedRoadmapId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingRoadmapId, setDeletingRoadmapId] = useState<string | null>(null);
  const [deletedRoadmapTitle, setDeletedRoadmapTitle] = useState<string | null>(null);
  const [showKebab, setShowKebab] = useState<string | null>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDays, setFormDays] = useState(7);
  const [formSkillId, setFormSkillId] = useState<string | null>(null);
  const [formGoalId, setFormGoalId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [editingRoadmapId, setEditingRoadmapId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSkillId, setEditSkillId] = useState<string | null>(null);
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    void fetchRoadmaps();
    void fetchGoals();
    void fetchSkills();
  }, [fetchRoadmaps, fetchGoals, fetchSkills]);

  useEffect(() => {
    if (!showKebab) return;
    const handler = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setShowKebab(null);
      }
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

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteRoadmap(id);
      toast({ type: "success", title: "Roadmap deleted", message: "Roadmap deleted successfully" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete roadmap";
      toast({ type: "error", title: "Delete failed", message: msg });
    } finally {
      setShowDeleteModal(false);
      setDeletingRoadmapId(null);
      setDeletedRoadmapTitle(null);
    }
  }, [deleteRoadmap, toast]);

  const openDeleteModal = useCallback((id: string, title: string) => {
    setDeletingRoadmapId(id);
    setDeletedRoadmapTitle(title);
    setShowDeleteModal(true);
    setShowKebab(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setShowDeleteModal(false);
    setDeletingRoadmapId(null);
    setDeletedRoadmapTitle(null);
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const title = formTitle.trim();
    const days = formDays;
    if (!title || title.length < 2 || title.length > 80) {
      setFormError("Title must be 2-80 characters");
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      setFormError("Days must be an integer between 1 and 90");
      return;
    }
    setSubmitting(true);
    try {
      const daysPayload = Array.from({ length: days }, (_, i) => ({
        learnTopic: "",
        buildTask: "",
      }));
      await createRoadmap({ title, totalDays: days, days: daysPayload, skillId: formSkillId, goalId: formGoalId });
      setShowForm(false);
      setFormTitle("");
      setFormDays(7);
      setFormSkillId(null);
      setFormGoalId(null);
      toast({ type: "success", title: "Roadmap created", message: "Roadmap created successfully" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create roadmap";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [formTitle, formDays, formSkillId, formGoalId, createRoadmap, toast]);

  const handleUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    const title = editTitle.trim();
    if (!title || title.length < 2 || title.length > 80) {
      setEditError("Title must be 2-80 characters");
      return;
    }
    try {
      await updateRoadmap({ title, skillId: editSkillId, goalId: editGoalId });
      setEditingRoadmapId(null);
      setEditTitle("");
      setEditSkillId(null);
      setEditGoalId(null);
      toast({ type: "success", title: "Roadmap updated", message: "Roadmap updated successfully" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update roadmap";
      setEditError(msg);
    }
  }, [editTitle, editSkillId, editGoalId, updateRoadmap, toast]);

  const openEditModal = useCallback((roadmap: Roadmap) => {
    setEditingRoadmapId(roadmap.id);
    setEditTitle(roadmap.title);
    setEditSkillId(roadmap.skillId ?? null);
    setEditGoalId(roadmap.goalId ?? null);
    setEditError(null);
    setShowKebab(null);
  }, []);

  interface RoadmapDay {
    id: string;
    dayNumber: number;
    learnTopic: string;
    buildTask: string;
    whatILearned: string | null;
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
    completed?: boolean;
  }

  const getProgressPercentage = (roadmap: Roadmap): number => {
    const total = roadmap.totalDays || 1;
    const completed = roadmap.completedDays ?? (roadmap.days?.filter((d) => d.completed).length ?? 0);
    return Math.round((completed / total) * 100);
  };

  const getCompletedDaysCount = (roadmap: Roadmap): number => {
    const completed = roadmap.completedDays ?? (roadmap.days?.filter((d) => d.completed).length ?? 0);
    return completed;
  };

  const getDays = (roadmap: Roadmap): RoadmapDay[] => roadmap.days ?? [];

  const getShortTitle = (text: string): string => {
    return text.replace(/^Day \d+ - /i, "").replace(/^Learn /i, "").replace(/^Build /i, "").trim();
  };

  const toggleRoadmapExpand = useCallback((id: string) => {
    setExpandedRoadmapId((prev: string | null) => {
      if (prev === id) return null;
      return id;
    });
  }, []);

  const toggleDayExpand = useCallback((dayId: string) => {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }, []);

  const getCurrentDayIndex = (days: any[], total: number, completed: number): number => {
    if (completed >= total) return -1;
    for (let i = 0; i < days.length; i++) {
      if (days[i].completed !== true) return i;
    }
    return days.length;
  };

  const dayStatus = (day: RoadmapDay, isCurrentDay: boolean, isCompleted: boolean) => {
    if (day.completed) return "completed";
    if (isCurrentDay) return "current";
    return "upcoming";
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">ROADMAPS</p>
          <h1>Learning roadmaps</h1>
        </div>
        <Button size="lg" onClick={() => { setFormTitle(""); setFormDays(7); setFormSkillId(null); setFormGoalId(null); setFormError(null); setShowForm(true); }}>
          <Plus size={20} /> Create Roadmap
        </Button>
      </header>
      <ApiLoadError error={error} onRetry={() => void fetchRoadmaps()} />
      {loading ? (
        <div className="page-loading">Loading roadmaps...</div>
      ) : roadmaps.length === 0 ? (
        <div className="empty-state">
          <Map size={40} />
          <strong>No roadmaps yet</strong>
          <p>Create your first roadmap to track learning progress.</p>
          <Button onClick={() => { setFormTitle(""); setFormDays(7); setFormSkillId(null); setFormGoalId(null); setFormError(null); setShowForm(true); }}>
            <Plus size={18} /> Create Roadmap
          </Button>
        </div>
      ) : (
        <div className="roadmaps-grid">
          {(roadmaps as Roadmap[]).map((roadmap: Roadmap) => {
            const days = getDays(roadmap);
            const total = roadmap.totalDays || days.length || 1;
            const completed = getCompletedDaysCount(roadmap);
            const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
            const isRoadmapExpanded = expandedRoadmapId === roadmap.id;
            const isCompleted = pct >= 100;
            const currentDayIndex = getCurrentDayIndex(days, total, completed);

            return (
              <Card key={roadmap.id} className="roadmap-card" padding="md">
                <div className="roadmap-card-wrapper" onClick={(e) => e.stopPropagation()}>
                  <header className="roadmap-header">
                    <ChevronDown
                      size={18}
                      className={`roadmap-expand-chevron ${isRoadmapExpanded ? "open" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleRoadmapExpand(roadmap.id); }}
                      aria-label={isRoadmapExpanded ? "Collapse roadmap" : "Expand roadmap"}
                    />
                    <div className="roadmap-title-section">
                      <strong>{roadmap.title}</strong>
                      {roadmap.description && <p className="roadmap-description">{roadmap.description}</p>}
                    </div>
                    <div className="roadmap-progress">
                      <Progress value={pct} />
                      <span className="progress-text">{pct}%</span>
                      <span className="days-text">{pct}% · {completed} of {total} days complete</span>
                    </div>
                    {isCompleted && (
                      <Badge variant="success" size="sm">Completed</Badge>
                    )}
                    <div className="roadmap-kebab-wrapper">
                      <button
                        className="kebab-icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowKebab(roadmap.id);
                        }}
                        aria-label="Roadmap options"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </header>

                  {(expandedRoadmapId === roadmap.id || !isCompleted) ? (
                    <div className="roadmap-timeline">
                      <div className="timeline-line" />

                      {days.map((day: any, index: number) => {
                        const dayNumber = day.dayNumber ?? index + 1;
                        const isDayCompleted = day.completed === true;
                        const isCurrentDay = index === getCurrentDayIndex(days, total, completed);
                        const isUpcomingDay = !isDayCompleted && !isCurrentDay;
                        const isExpanded = expandedDayIds.has(day.id);
                        const allComplete = pct >= 100;
                        const shouldExpand = isExpanded || (isCurrentDay && !allComplete);

                        const learnTopic = day.learnTopic || `Learn Day ${dayNumber}`;
                        const buildTask = day.buildTask || `Build Day ${dayNumber}`;

                        const displayTitle = getShortTitle(learnTopic) || `Day ${dayNumber}`;
                        const displayLearnTopic = learnTopic.replace(/^Day \d+ - /i, "").replace(/^Learn /i, "").trim();
                        const displayBuildTask = buildTask.replace(/^Day \d+ - /i, "").replace(/^Build /i, "").trim();

                        const status = dayStatus(day, isCurrentDay, pct >= 100);
                        const dayStatusClass = `day-node ${status}`;
                        const dayStatusAria =
                          isDayCompleted ? "Completed" :
                          isCurrentDay ? "Current day" : "Upcoming";

                        return (
                          <div
                            key={day.id}
                            className={`day-node-wrapper ${shouldExpand ? "" : "compact"}`}
                            aria-label={dayStatusAria}
                          >
                            <button
                              className={dayStatusClass}
                              onClick={() => toggleDayExpand(day.id)}
                              aria-label={dayStatusAria}
                              disabled={allComplete && !isCurrentDay}
                            >
                              {isDayCompleted ? (
                                <CheckCircle2 size={16} />
                              ) : isCurrentDay ? (
                                <span className="node-number">{dayNumber}</span>
                              ) : (
                                <span className="node-number">{dayNumber}</span>
                              )}
                            </button>

                            {shouldExpand && (
                              <div className="day-card" aria-label={`Day ${dayNumber} details`} onClick={() => {}}>
                                <header className="day-card-header">
                                  <h3 className="day-title">{displayTitle || `Day ${dayNumber}`}</h3>
                                  <div className="day-card-badges">
                                    <span className={`day-status-badge ${isDayCompleted ? "completed" : isCurrentDay ? "current" : "upcoming"}`}>
                                      {isDayCompleted ? "completed" : isCurrentDay ? "in progress" : "upcoming"}
                                    </span>
                                  </div>
                                </header>
                                <div className="day-sections-row">
                                  <div className="day-section-box learn">
                                    <label className="section-label">LEARN</label>
                                    <p className="section-text">{displayLearnTopic || learnTopic}</p>
                                  </div>
                                  <div className="day-section-box build">
                                    <label className="section-label">BUILD</label>
                                    <p className="section-text">{displayBuildTask || buildTask}</p>
                                  </div>
                                </div>
                                <Textarea
                                  label="What I learned"
                                  value={day.whatILearned ?? ""}
                                  onChange={(e) => completeDay(roadmap.id, day.id, e.target.value)}
                                  placeholder={isDayCompleted ? "Notes on what you learned..." : "Reflect on what you learned today..."}
                                  disabled={!isDayCompleted && !isCurrentDay}
                                  rows={3}
                                />
                                <div className="day-card-actions">
                                  {isDayCompleted ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => completeDay(roadmap.id, day.id, day.whatILearned ?? "")}
                                    >
                                      <RotateCcw size={14} /> Undo
                                    </Button>
                                  ) : isCurrentDay ? (
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => completeDay(roadmap.id, day.id, "")}
                                    >
                                      <CheckCircle2 size={14} /> Mark complete
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            )}

                            {!shouldExpand && (
                              <div
                                className="compact-day-line"
                                onClick={() => toggleDayExpand(day.id)}
                                role="button"
                                tabIndex={0}
                                aria-label="Expand day"
                              >
                                <ChevronRight size={14} />
                                <span className="compact-day-text">
                                  {getShortTitle(learnTopic) || `Day ${dayNumber}`}
                                  {isDayCompleted && <span className="compact-day-status"> · completed</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {showDeleteModal && (
        <Modal isOpen={showDeleteModal} onClose={closeDeleteModal} title="Delete Roadmap">
          <p>
            Are you sure you want to delete the roadmap "<strong>{deletedRoadmapTitle}</strong>"?
          </p>
          <div className="modal-actions">
            <Button variant="ghost" onClick={closeDeleteModal}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(deletingRoadmapId!)}>Delete</Button>
          </div>
        </Modal>
      )}
      {showKebab && (
        <div className="kebab-menu-overlay" onClick={() => setShowKebab(null)}>
          <div className="kebab-menu" ref={kebabRef} onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" onClick={() => { openEditModal(roadmaps.find(r => r.id === showKebab)!); }}>
              <Pencil size={14} /> Edit
            </Button>
            <Button variant="danger" onClick={() => openDeleteModal(showKebab, "")}>
              Delete
            </Button>
          </div>
        </div>
      )}
      {editingRoadmapId && (
        <Modal isOpen={true} onClose={() => { setEditingRoadmapId(null); setEditTitle(""); setEditSkillId(null); setEditGoalId(null); setEditError(null); }} title="Edit Roadmap">
          <form onSubmit={handleUpdate} className="modal-form">
            <Input
              label="Roadmap title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
            <Select
              label="Skill (optional)"
              value={editSkillId ?? ""}
              onChange={(e) => setEditSkillId(e.target.value || null)}
              options={[{ value: "", label: "None" }, ...(skills?.map((s: any) => ({ value: s.id, label: s.name })) ?? [])]}
            />
            <Select
              label="Goal (optional)"
              value={editGoalId ?? ""}
              onChange={(e) => setEditGoalId(e.target.value || null)}
              options={[{ value: "", label: "None" }, ...(goals?.map((g: any) => ({ value: g.id, label: g.title })) ?? [])]}
            />
            {editError && <p className="form-error">{editError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => { setEditingRoadmapId(null); setEditTitle(""); setEditSkillId(null); setEditGoalId(null); setEditError(null); }}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      )}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setFormTitle(""); setFormDays(7); setFormSkillId(null); setFormGoalId(null); setFormError(null); }} title="Create Roadmap">
        <form onSubmit={handleCreate} className="modal-form">
          <Input
            label="Roadmap title/topic"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            required
            maxLength={80}
            placeholder="e.g., TypeScript, React, Machine Learning"
          />
          <div className="form-row">
            <Input
              label="Number of days"
              type="number"
              min="1"
              max="90"
              value={formDays}
              onChange={(e) => setFormDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
              required
            />
            <div className="day-chips">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`day-chip ${formDays === d ? "active" : ""}`}
                  onClick={() => setFormDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <Select
            label="Skill (optional)"
            value={formSkillId ?? ""}
            onChange={(e) => setFormSkillId(e.target.value || null)}
            options={[{ value: "", label: "None" }, ...(skills?.map((s: any) => ({ value: s.id, label: s.name })) ?? [])]}
          />
          <Select
            label="Goal (optional)"
            value={formGoalId ?? ""}
            onChange={(e) => setFormGoalId(e.target.value || null)}
            options={[{ value: "", label: "None" }, ...(goals?.map((g: any) => ({ value: g.id, label: g.title })) ?? [])]}
          />
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setFormTitle(""); setFormDays(7); setFormSkillId(null); setFormGoalId(null); setFormError(null); }}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
