import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Dumbbell, Camera, Play, Square, Trash2, Check, Timer,
  TrendingUp, X, Image as ImageIcon, MoreVertical, Copy,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSports, type Sport } from "../hooks/useSports";
import { usePoints } from "../hooks/usePoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Input } from "../components/Input";
import { Checkbox } from "../components/Checkbox";
import { Select } from "../components/Select";
import { ApiLoadError } from "../components/ApiLoadError";
import { useToast } from "../components/Toast";
import { audioAlert } from "../utils/notify";

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];

type Ex = { name: string; sets: number; reps: string; restSec?: number };
type DayPlan = { weekday: number; title: string; exercises: Ex[] };

const blankEx = (): Ex => ({ name: "", sets: 3, reps: "10" });

function pad(v: number) { return String(Math.max(0, Math.floor(v))).padStart(2, "0"); }
function formatElapsed(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function formatDuration(s: number) {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${pad(t % 60)}s`;
}

function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Choose an image file")); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error("Image too large (max 12MB)")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const size = 760, scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function SportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { sports, loading, error, fetchSports, createSport, addPhoto, saveSession, stopSport, deleteSport } = useSports(user?.id ?? null);
  const { points, refresh: refreshPoints } = usePoints(user?.id ?? null);

  // Setup state
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sportName, setSportName] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [durationValue, setDurationValue] = useState("1");
  const [untilStopped, setUntilStopped] = useState(false);
  const [restSeconds, setRestSeconds] = useState(60);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [dailyCommitments, setDailyCommitments] = useState(false);
  const [commitmentDays, setCommitmentDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workoutDays, setWorkoutDays] = useState<DayPlan[]>([]);
  const [weeklyKey, setWeeklyKey] = useState("");

  // Workout state
  const [workoutSport, setWorkoutSport] = useState<Sport | null>(null);
  const [workoutStartedAt, setWorkoutStartedAt] = useState<Date | null>(null);
  const [workoutNow, setWorkoutNow] = useState(0);
  const [workoutDayIndex, setWorkoutDayIndex] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(new Set());
  const [restLeft, setRestLeft] = useState(-1);
  const [workoutSaving, setWorkoutSaving] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);
  const restEndRef = useRef<number | null>(null);

  // Modals
  const [stopTarget, setStopTarget] = useState<Sport | null>(null);
  const [stoppedSummary, setStoppedSummary] = useState<Sport | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sport | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<Sport | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [detailSport, setDetailSport] = useState<Sport | null>(null);
  const [kebabOpen, setKebabOpen] = useState<string | null>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { void refreshPoints(); }, [refreshPoints]);
  useEffect(() => {
    if (!workoutStartedAt) return;
    const t = window.setInterval(() => setWorkoutNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [workoutStartedAt]);
  useEffect(() => {
    if (restLeft <= 0) return;
    const t = window.setInterval(() => setRestLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [restLeft]);
  useEffect(() => {
    if (restLeft !== 0) return;
    if (!workoutStartedAt) return;
    audioAlert();
    if ("vibrate" in navigator) navigator.vibrate([180, 90, 180]);
  }, [restLeft, workoutStartedAt]);
  useEffect(() => {
    if (!kebabOpen) return;
    const handler = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) setKebabOpen(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [kebabOpen]);

  const resetSetup = useCallback(() => {
    setSetupStep(0); setSetupError(null); setSportName(""); setDaysPerWeek(3);
    setDurationValue("1"); setUntilStopped(false); setRestSeconds(60);
    setPhotoPreview(null); setDailyCommitments(false);
    setCommitmentDays([1, 2, 3, 4, 5]); setWorkoutDays([]);
    setWeeklyKey(String(Date.now()));
  }, []);

  const openSetup = useCallback(() => { resetSetup(); setShowSetup(true); }, [resetSetup]);

  const elapsed = workoutStartedAt ? Math.max(0, Math.floor((workoutNow - workoutStartedAt.getTime()) / 1000)) : 0;

  // Setup helpers
  const addDay = useCallback(() => {
    const existing = new Set(workoutDays.map((d) => d.weekday));
    const next = ORDER.find((d) => !existing.has(d)) ?? 1;
    setWorkoutDays((prev) => [...prev, { weekday: next, title: "", exercises: [blankEx()] }]);
  }, [workoutDays]);

  const removeDay = useCallback((idx: number) => {
    setWorkoutDays((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const copyDay = useCallback((fromIdx: number) => {
    const src = workoutDays[fromIdx];
    if (!src) return;
    setWorkoutDays((prev) => [...prev, { ...src, exercises: src.exercises.map((e) => ({ ...e })) }]);
  }, [workoutDays]);

  const updateDayTitle = useCallback((idx: number, title: string) => {
    setWorkoutDays((prev) => prev.map((d, i) => i === idx ? { ...d, title } : d));
  }, []);

  const addExercise = useCallback((dayIdx: number) => {
    setWorkoutDays((prev) => prev.map((d, i) => i === dayIdx ? { ...d, exercises: [...d.exercises, blankEx()] } : d));
  }, []);

  const removeExercise = useCallback((dayIdx: number, exIdx: number) => {
    setWorkoutDays((prev) => prev.map((d, i) => i === dayIdx ? { ...d, exercises: d.exercises.filter((_, j) => j !== exIdx) } : d));
  }, []);

  const updateExercise = useCallback((dayIdx: number, exIdx: number, patch: Partial<Ex>) => {
    setWorkoutDays((prev) => prev.map((d, i) => i === dayIdx ? {
      ...d,
      exercises: d.exercises.map((e, j) => j === exIdx ? { ...e, ...patch } : e),
    } : d));
  }, []);

  const toggleCommitmentDay = useCallback((v: number) => {
    setCommitmentDays((d) => d.includes(v) ? d.filter((x) => x !== v) : [...d, v]);
  }, []);

  const handlePhotoFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try { setPhotoPreview(await resizeImageFile(file)); }
    catch (e) { setSetupError(e instanceof Error ? e.message : "Could not read image"); }
  }, []);

  const validateSetup = useCallback((step = setupStep): boolean => {
    setSetupError(null);
    if (step === 0) {
      if (!sportName.trim() || sportName.trim().length < 2) { setSetupError("Enter a sport name"); return false; }
      if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) { setSetupError("Days must be 1-7"); return false; }
      if (!untilStopped && (!Number.isInteger(Number(durationValue)) || Number(durationValue) < 1 || Number(durationValue) > 24)) { setSetupError("Duration must be 1-24 months"); return false; }
      return true;
    }
    if (workoutDays.length === 0) { setSetupError("Add at least one training day with exercises"); return false; }
    for (const d of workoutDays) {
      if (!d.title.trim()) { setSetupError(`Day ${DAY_FULL[d.weekday]} needs a title`); return false; }
      const valid = d.exercises.filter((e) => e.name.trim());
      if (valid.length === 0) { setSetupError(`${d.title}: add at least one exercise`); return false; }
      for (const e of valid) {
        if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 30) { setSetupError("Sets must be 1-30"); return false; }
        if (!e.reps.trim()) { setSetupError("Each exercise needs reps"); return false; }
      }
    }
    if (dailyCommitments && commitmentDays.length === 0) { setSetupError("Pick at least one commitment day"); return false; }
    return true;
  }, [sportName, daysPerWeek, untilStopped, durationValue, workoutDays, dailyCommitments, commitmentDays, setupStep]);

  const goNext = useCallback(() => {
    if (!validateSetup(setupStep)) return;
    setSetupStep((s) => Math.min(3, s + 1));
  }, [setupStep, validateSetup]);

  const handleCreate = useCallback(async () => {
    setSetupError(null);
    if (!validateSetup()) { setSetupStep(0); return; }
    setSubmitting(true);
    try {
      await createSport({
        name: sportName.trim(), daysPerWeek, durationMonths: untilStopped ? null : Number(durationValue),
        untilStopped, restSeconds,
        workoutDays: workoutDays.map((d) => ({
          weekday: d.weekday, title: d.title.trim(),
          exercises: d.exercises.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), sets: e.sets, reps: e.reps.trim(), restSec: e.restSec })),
        })),
        photo: photoPreview, dailyCommitments, commitmentDays,
      });
      setShowSetup(false); resetSetup(); await refreshPoints();
      toast({ type: "success", title: "Sport added", message: "Your gym setup is ready." });
    } catch (e) { setSetupError(e instanceof Error ? e.message : "Could not create sport"); }
    finally { setSubmitting(false); }
  }, [sportName, daysPerWeek, untilStopped, durationValue, restSeconds, workoutDays, photoPreview, dailyCommitments, commitmentDays, createSport, resetSetup, refreshPoints, toast, validateSetup]);

  // Workout
  const startWorkout = useCallback((sport: Sport) => {
    const todayWd = new Date().getDay();
    const dayIdx = sport.workoutDays.findIndex((d) => d.weekday === todayWd);
    setWorkoutSport(sport);
    setWorkoutStartedAt(new Date());
    setWorkoutNow(Date.now());
    setWorkoutDayIndex(dayIdx >= 0 ? dayIdx : 0);
    setCompletedExercises(new Set());
    setRestLeft(-1); restEndRef.current = null;
    setWorkoutError(null);
  }, []);

  const toggleExercise = useCallback((idx: number) => {
    setCompletedExercises((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); }
      else {
        next.add(idx);
        const dayPlan = workoutSport?.workoutDays?.[workoutDayIndex];
        const ex = dayPlan?.exercises?.[idx];
        const rs = ex?.restSec ?? workoutSport?.restSeconds ?? 60;
        if (rs > 0) { restEndRef.current = Date.now() + rs * 1000; setRestLeft(rs); }
      }
      return next;
    });
  }, [workoutSport, workoutDayIndex]);

  const finishWorkout = useCallback(async () => {
    if (!workoutSport || !workoutStartedAt) return;
    setWorkoutSaving(true); setWorkoutError(null);
    const endedAt = new Date();
    try {
      const dayPlan = workoutSport.workoutDays?.[workoutDayIndex];
      await saveSession(workoutSport.id, workoutStartedAt.toISOString(), endedAt.toISOString(),
        dayPlan?.exercises?.filter((_, i) => completedExercises.has(i)).map((e) => e.name) ?? []);
      await refreshPoints();
      toast({ type: "success", title: "Workout saved", message: "+15 points." });
      setWorkoutSport(null); setWorkoutStartedAt(null); setRestLeft(-1); restEndRef.current = null;
    } catch (e) { setWorkoutError(e instanceof Error ? e.message : "Could not save workout"); }
    finally { setWorkoutSaving(false); }
  }, [workoutSport, workoutStartedAt, workoutDayIndex, completedExercises, saveSession, refreshPoints, toast]);

  const cancelWorkout = useCallback(() => {
    if (workoutSaving) return;
    setWorkoutSport(null); setWorkoutStartedAt(null); setRestLeft(-1);
    setCompletedExercises(new Set()); setWorkoutError(null); restEndRef.current = null;
  }, [workoutSaving]);

  const handleStop = useCallback(async () => {
    if (!stopTarget) return;
    setStopBusy(true);
    try { const s = await stopSport(stopTarget.id); setStopTarget(null); setStoppedSummary(s);
      toast({ type: "success", title: "Sport stopped", message: "Final analysis ready." });
    } catch (e) { toast({ type: "error", title: "Could not stop", message: e instanceof Error ? e.message : "Try again" }); }
    finally { setStopBusy(false); }
  }, [stopTarget, stopSport, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try { await deleteSport(deleteTarget.id); setDeleteTarget(null); await refreshPoints();
      toast({ type: "success", title: "Sport deleted", message: "Removed successfully" });
    } catch (e) { toast({ type: "error", title: "Delete failed", message: e instanceof Error ? e.message : "Try again" }); }
    finally { setDeleteBusy(false); }
  }, [deleteTarget, deleteSport, refreshPoints, toast]);

  const openPhotoPicker = useCallback((s: Sport) => { setPhotoTarget(s); photoInputRef.current?.click(); }, []);
  const handleProgressPhoto = useCallback(async (file: File | undefined) => {
    if (!file || !photoTarget) return;
    setPhotoBusy(true);
    try { const url = await resizeImageFile(file); await addPhoto(photoTarget.id, url, new Date().toLocaleDateString());
      toast({ type: "success", title: "Photo saved", message: "Progress photo added." }); setPhotoTarget(null);
    } catch (e) { toast({ type: "error", title: "Photo failed", message: e instanceof Error ? e.message : "Try again" }); }
    finally { setPhotoBusy(false); if (photoInputRef.current) photoInputRef.current.value = ""; }
  }, [photoTarget, addPhoto, toast]);

  const stats = useMemo(() => ({
    active: sports.filter((s) => Boolean(s.active)).length,
    workouts: sports.reduce((sum, s) => sum + (s.analysis?.totalWorkouts ?? 0), 0),
  }), [sports]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SPORTS</p>
          <h1>Gym &amp; training</h1>
          <p className="header-date">
            {stats.active} active · {stats.workouts} workouts logged
            {points ? ` · ${points.currentTotal} pts · Level ${points.level}` : ""}
          </p>
        </div>
        <Button size="lg" onClick={openSetup}><Plus size={20} /> Add Sport</Button>
      </header>

      <ApiLoadError error={error} onRetry={() => void fetchSports()} />
      <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(e) => void handleProgressPhoto(e.target.files?.[0])} />

      {loading ? (<div className="page-loading">Loading sports...</div>)
      : sports.length === 0 ? (
        <div className="empty-state">
          <Dumbbell size={40} /><strong>No sports yet</strong>
          <p>Set up gym with per-day workout plans and track every session.</p>
          <Button onClick={openSetup}><Plus size={18} /> Add Sport</Button>
        </div>
      ) : (
        <div className="sports-grid">
          {sports.map((sport) => {
            const active = Boolean(sport.active);
            const photoDue = Boolean(sport.photoDue);
            const todayWd = new Date().getDay();
            const todayDay = sport.workoutDays?.find((d) => d.weekday === todayWd);
            return (
              <Card key={sport.id} className={`sport-card ${!active ? "is-stopped" : ""}`} padding="md">
                {/* 1. Header */}
                <div className="sport-card-top">
                  <div className="sport-heading">
                    <span className="sport-icon"><Dumbbell size={18} /></span>
                    <div>
                      <strong>{sport.name}</strong>
                      <p className="sport-meta">{sport.daysPerWeek}x / week · Rest {sport.restSeconds}s · {sport.untilStopped ? "Until stopped" : `${sport.durationMonths} month${sport.durationMonths === 1 ? "" : "s"}`}</p>
                    </div>
                  </div>
                  <Badge variant={active ? "success" : "outline"} size="sm">{active ? "Active" : "Stopped"}</Badge>
                </div>

                {/* 2. Week strip */}
                <div className="week-strip">
                  {ORDER.map((wd, i) => {
                    const isTraining = sport.commitmentDays?.includes(wd) || sport.workoutDays?.some((d) => d.weekday === wd);
                    const isToday = wd === todayWd;
                    const hasDone = sport.sessions?.some((s) => new Date(s.startedAt).getDay() === wd && new Date(s.startedAt).toDateString() === new Date().toDateString());
                    return <span key={i} className={`week-circle ${isTraining ? "training" : ""} ${isToday ? "today" : ""} ${hasDone ? "done" : ""}`} title={DAY_FULL[wd]} />;
                  })}
                </div>

                {/* 3. Stats */}
                <div className="sport-stats">
                  <div className="sport-stat"><span>Workouts</span><strong>{sport.analysis?.totalWorkouts ?? 0}</strong></div>
                  <div className="sport-stat"><span>Consistency</span><strong>{sport.analysis?.consistency ?? 0}%</strong></div>
                  <div className="sport-stat"><span>Avg time</span><strong>{sport.analysis?.averageMinutes ?? 0}m</strong></div>
                </div>

                {/* 4. Photo due */}
                {photoDue && active && (
                  <div className="sport-photo-due">
                    <Camera size={16} /><span>Time for a new progress photo</span>
                    <Button variant="secondary" size="sm" loading={photoBusy && photoTarget?.id === sport.id} onClick={() => openPhotoPicker(sport)}>Add photo</Button>
                  </div>
                )}

                {/* 5. Today's plan */}
                <div className="sport-today">
                  <span className="sport-today-label">{todayDay ? `Today: ${todayDay.title || DAY_FULL[todayWd]}` : "Rest day"}</span>
                  <div className="sport-exercises">
                    {todayDay?.exercises?.map((ex) => (
                      <span className="exercise-pill" key={ex.name}>{ex.name} <small>{ex.sets}\u00D7{ex.reps}</small></span>
                    ))}
                    {!todayDay && <span className="sport-hint">No workout planned</span>}
                  </div>
                </div>

                {/* Photos */}
                {sport.photos.length > 0 && (
                  <div className="sport-photos">
                    {sport.photos.slice(0, 3).map((p) => (
                      <button key={p.id} type="button" className="sport-photo-thumb" onClick={() => setDetailSport(sport)}>
                        <img src={p.image} alt="Progress" />
                      </button>
                    ))}
                    <span className="photo-count"><ImageIcon size={12} /> {sport.photos.length}</span>
                  </div>
                )}

                {/* 6. Actions */}
                <div className="sport-actions">
                  {active ? (
                    <>
                      <Button onClick={() => startWorkout(sport)} className="sport-btn-primary"><Play size={16} /> Start Workout</Button>
                      <Button variant="outline" size="sm" onClick={() => openPhotoPicker(sport)}><Camera size={14} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDetailSport(sport)}>Details</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => setStoppedSummary(sport)}><TrendingUp size={16} /> Analysis</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDetailSport(sport)}>Details</Button>
                    </>
                  )}
                  <div className="sport-overflow" ref={kebabRef}>
                    <button className="kebab-icon" onClick={() => setKebabOpen(kebabOpen === sport.id ? null : sport.id)} aria-label="More options">
                      <MoreVertical size={16} />
                    </button>
                    {kebabOpen === sport.id && (
                      <div className="kebab-menu">
                        <button onClick={() => setDetailSport(sport)}><Copy size={14} /> Edit plan</button>
                        {!active && <button onClick={() => setStoppedSummary(sport)}><TrendingUp size={14} /> View analysis</button>}
                        <button onClick={() => setStopTarget(sport)} className="kebab-danger"><Square size={14} /> Stop</button>
                        <button onClick={() => setDeleteTarget(sport)} className="kebab-danger"><Trash2 size={14} /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* SETUP */}
      <Modal isOpen={showSetup} onClose={() => { setShowSetup(false); resetSetup(); }} title="Set up a sport" size="lg">
        <div className="sport-stepper">
          {[0, 1, 2, 3].map((s) => (
            <span key={s} className={`sport-step ${setupStep === s ? "active" : ""} ${setupStep > s ? "done" : ""}`}>
              {setupStep > s ? <Check size={12} /> : s + 1}
            </span>
          ))}
        </div>

        {setupStep === 0 && (
          <div className="modal-form">
            <Input label="Sport name" placeholder="e.g., Gym, Running" value={sportName} onChange={(e) => setSportName(e.target.value)} maxLength={60} required />
            <div className="form-row">
              <Input label="Days per week" type="number" min={1} max={7} value={daysPerWeek} onChange={(e) => setDaysPerWeek(Math.max(1, Math.min(7, parseInt(e.target.value) || 1)))} />
              <div className="day-chips">
                {[2, 3, 5].map((v) => (<button key={v} type="button" className={`day-chip ${daysPerWeek === v ? "active" : ""}`} onClick={() => setDaysPerWeek(v)}>{v}x</button>))}
              </div>
            </div>
            <div className="form-row">
              <Input label="Rest (sec)" type="number" min={0} max={600} value={restSeconds} onChange={(e) => setRestSeconds(Math.max(0, Math.min(600, parseInt(e.target.value) || 0)))} />
              <Select label="Duration" value={untilStopped ? "until" : durationValue} onChange={(e) => { if (e.target.value === "until") setUntilStopped(true); else { setUntilStopped(false); setDurationValue(e.target.value); } }} options={[{ value: "1", label: "1 month" }, { value: "3", label: "3 months" }, { value: "6", label: "6 months" }, { value: "12", label: "12 months" }, { value: "until", label: "Until stopped" }]} />
            </div>
            {setupError && <p className="form-error">{setupError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => { setShowSetup(false); resetSetup(); }}>Cancel</Button>
              <Button type="button" onClick={goNext}>Next: training days</Button>
            </div>
          </div>
        )}

        {setupStep === 1 && (
          <div className="modal-form">
            <p className="form-hint">Select your training days, then add exercises for each day.</p>
            <div className="commitment-day-picker">
              {ORDER.map((wd) => (
                <button key={wd} type="button" className={`commitment-day ${workoutDays.some((d) => d.weekday === wd) ? "active" : ""}`} onClick={() => {
                  if (workoutDays.some((d) => d.weekday === wd)) return;
                  setWorkoutDays((prev) => [...prev, { weekday: wd, title: DAY_FULL[wd], exercises: [blankEx()] }]);
                }}>{DAY_ABBR[ORDER.indexOf(wd)]}</button>
              ))}
            </div>
            <div className="workout-days-setup">
              {workoutDays.map((d, idx) => (
                <div key={idx} className="workout-day-block">
                  <div className="workout-day-header">
                    <span className="workout-day-label">{DAY_FULL[d.weekday]}</span>
                    <div className="workout-day-actions">
                      <button type="button" className="icon-btn" onClick={() => copyDay(idx)} title="Copy from this day"><Copy size={14} /></button>
                      {workoutDays.length > 1 && <button type="button" className="icon-btn text-danger" onClick={() => removeDay(idx)}><X size={14} /></button>}
                    </div>
                  </div>
                  <Input placeholder="Day title (e.g. Chest & Triceps)" value={d.title} onChange={(e) => updateDayTitle(idx, e.target.value)} />
                  <div className="exercise-editor">
                    {d.exercises.map((ex, ei) => (
                      <div className="exercise-row" key={ei}>
                        <Input placeholder="Exercise" value={ex.name} onChange={(e) => updateExercise(idx, ei, { name: e.target.value })} />
                        <Input type="number" min={1} max={30} placeholder="Sets" value={ex.sets} onChange={(e) => updateExercise(idx, ei, { sets: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) })} />
                        <Input placeholder="Reps" value={ex.reps} onChange={(e) => updateExercise(idx, ei, { reps: e.target.value })} />
                        <button type="button" className="icon-btn" onClick={() => removeExercise(idx, ei)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => addExercise(idx)}><Plus size={14} /> Add exercise</Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={addDay}><Plus size={14} /> Add training day</Button>
            {setupError && <p className="form-error">{setupError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setSetupStep(0)}>Back</Button>
              <Button type="button" onClick={goNext}>Next: photo &amp; commitments</Button>
            </div>
          </div>
        )}

        {setupStep === 2 && (
          <div className="modal-form">
            <div className="setup-photo-block">
              <div className="setup-photo-preview">
                {photoPreview ? <img src={photoPreview} alt="Preview" /> : <ImageIcon size={28} />}
              </div>
              <div>
                <strong>Starting photo</strong>
                <p className="sport-hint">Optional. A photo every week tracks progress.</p>
                <label className="photo-picker-button"><Camera size={14} /> Choose photo
                  <input key={weeklyKey} type="file" accept="image/*" hidden onChange={(e) => void handlePhotoFile(e.target.files?.[0])} />
                </label>
              </div>
            </div>
            <Checkbox label="Add to daily commitments" description="Show this sport in your daily promises." checked={dailyCommitments} onChange={(e) => setDailyCommitments(e.target.checked)} />
            {dailyCommitments && (
              <div className="commitment-day-picker">
                {ORDER.map((wd) => (
                  <button key={wd} type="button" className={`commitment-day ${commitmentDays.includes(wd) ? "active" : ""}`} onClick={() => toggleCommitmentDay(wd)}>{DAY_ABBR[ORDER.indexOf(wd)]}</button>
                ))}
              </div>
            )}
            {setupError && <p className="form-error">{setupError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setSetupStep(1)}>Back</Button>
              <Button type="button" loading={submitting} onClick={() => void handleCreate()}><Check size={16} /> Create sport</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* WORKOUT */}
      <Modal isOpen={Boolean(workoutSport)} onClose={cancelWorkout} title={workoutSport ? `Workout: ${workoutSport.name}` : "Workout"} size="md">
        {workoutSport && (() => {
          const dayPlan = workoutSport.workoutDays?.[workoutDayIndex];
          if (!dayPlan) return <p>No workout planned for this day.</p>;
          return (
            <div className="workout-runner">
              <div className="workout-header">
                <div className="workout-timer"><Timer size={20} /><span>{formatElapsed(elapsed)}</span></div>
                {workoutSport.workoutDays!.length > 1 && (
                  <select className="workout-day-select" value={workoutDayIndex} onChange={(e) => { setWorkoutDayIndex(Number(e.target.value)); setCompletedExercises(new Set()); setRestLeft(-1); }}>
                    {workoutSport.workoutDays!.map((d, i) => <option key={i} value={i}>{DAY_FULL[d.weekday]}: {d.title || DAY_FULL[d.weekday]}</option>)}
                  </select>
                )}
              </div>
              {restLeft > 0 ? (
                <div className="rest-timer"><p>Rest</p><strong>{formatElapsed(restLeft)}</strong><Button variant="ghost" size="sm" onClick={() => { setRestLeft(-1); restEndRef.current = null; }}>Skip rest</Button></div>
              ) : <p className="workout-hint">Tick each exercise as you finish it. Rest starts automatically.</p>}
              <div className="workout-exercises">
                {dayPlan.exercises.map((ex, idx) => (
                  <label key={idx} className={`workout-exercise ${completedExercises.has(idx) ? "done" : ""}`}>
                    <Checkbox checked={completedExercises.has(idx)} onChange={() => toggleExercise(idx)} />
                    <span className="workout-exercise-name">{ex.name}</span>
                    <span className="workout-exercise-plan">{ex.sets}\u00D7{ex.reps}</span>
                  </label>
                ))}
              </div>
              {workoutError && <p className="form-error">{workoutError}</p>}
              <div className="modal-actions">
                <Button type="button" variant="ghost" onClick={cancelWorkout} disabled={workoutSaving}>Discard</Button>
                <Button type="button" loading={workoutSaving} onClick={() => void finishWorkout()}><Square size={14} /> End &amp; save</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* STOP CONFIRM */}
      <Modal isOpen={Boolean(stopTarget)} onClose={() => setStopTarget(null)} title="Stop this sport?">
        <p>Stopping <strong>{stopTarget?.name}</strong> ends tracking and shows final analysis.</p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setStopTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={stopBusy} onClick={() => void handleStop()}><Square size={14} /> Stop sport</Button>
        </div>
      </Modal>

      {/* DELETE CONFIRM */}
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete this sport?">
        <p>Delete <strong>{deleteTarget?.name}</strong>? Workouts, photos and achievement will be removed. This cannot be undone.</p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteBusy} onClick={() => void handleDelete()}><Trash2 size={14} /> Delete</Button>
        </div>
      </Modal>

      {/* ANALYSIS */}
      <Modal isOpen={Boolean(stoppedSummary)} onClose={() => setStoppedSummary(null)} title={stoppedSummary ? `${stoppedSummary.name} \u2014 final analysis` : "Analysis"}>
        {stoppedSummary && <SportAnalysisBlock sport={stoppedSummary} />}
        <div className="modal-actions"><Button onClick={() => setStoppedSummary(null)}>Close</Button></div>
      </Modal>

      {/* DETAIL */}
      <Modal isOpen={Boolean(detailSport)} onClose={() => setDetailSport(null)} title={detailSport ? detailSport.name : "Details"} size="lg">
        {detailSport && (
          <div className="sport-details">
            <SportAnalysisBlock sport={detailSport} />
            <div className="details-section">
              <h4><Dumbbell size={15} /> Training days</h4>
              {detailSport.workoutDays?.map((d, i) => (
                <div key={i} className="detail-day">
                  <strong>{DAY_FULL[d.weekday]}: {d.title || "Untitled"}</strong>
                  <div className="sport-exercises">
                    {d.exercises.map((ex) => (<span className="exercise-pill" key={ex.name}>{ex.name} <small>{ex.sets}\u00D7{ex.reps}</small></span>))}
                  </div>
                </div>
              ))}
              {(!detailSport.workoutDays || detailSport.workoutDays.length === 0) && <p className="sport-hint">No training days configured.</p>}
            </div>
            {detailSport.photos.length > 0 && (
              <div className="details-section">
                <h4><TrendingUp size={15} /> Progress photos</h4>
                <div className="photo-timeline">
                  {detailSport.photos.map((p) => (<figure key={p.id}><img src={p.image} alt="Progress" /><figcaption>{new Date(p.createdAt).toLocaleDateString()}</figcaption></figure>))}
                </div>
              </div>
            )}
            {detailSport.sessions.length > 0 && (
              <div className="details-section">
                <h4><Timer size={15} /> Recent workouts</h4>
                <ul className="session-list">
                  {detailSport.sessions.slice(0, 8).map((s) => (<li key={s.id}><span>{new Date(s.startedAt).toLocaleDateString()}</span><strong>{formatDuration(s.durationSeconds)}</strong></li>))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="modal-actions"><Button onClick={() => setDetailSport(null)}>Close</Button></div>
      </Modal>
    </div>
  );
}

function SportAnalysisBlock({ sport }: { sport: Sport }) {
  const a = sport.analysis;
  return (
    <div className="sport-analysis">
      <div className="analysis-grid">
        <div><span>Total workouts</span><strong>{a?.totalWorkouts ?? 0}</strong></div>
        <div><span>Total time</span><strong>{a?.totalMinutes ?? 0}m</strong></div>
        <div><span>Average</span><strong>{a?.averageMinutes ?? 0}m</strong></div>
        <div><span>Consistency</span><strong>{a?.consistency ?? 0}%</strong></div>
      </div>
      {sport.photos.length > 0 && (
        <div className="analysis-photos">
          <figure><img src={a?.latestPhoto?.image ?? sport.photos[0]?.image} alt="Latest" /><figcaption>Latest</figcaption></figure>
          {sport.photos.length > 1 && <figure><img src={a?.firstPhoto?.image ?? sport.photos[sport.photos.length - 1]?.image} alt="First" /><figcaption>Starting point</figcaption></figure>}
        </div>
      )}
      <p className="sport-hint">{sport.active ? "Stop the sport to lock in your final analysis." : `Finished after ${a?.finishedInDays ?? 0} day(s).`}</p>
    </div>
  );
}
