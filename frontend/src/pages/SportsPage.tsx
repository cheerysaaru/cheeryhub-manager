import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Dumbbell, Camera, Play, Square, Trash2, Check, Timer,
  TrendingUp, X, Image as ImageIcon, MoreVertical, Copy,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSports, type Sport, type PhotoAnalysis } from "../hooks/useSports";
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
  const { sports, loading, error, fetchSports, createSport, addPhoto, saveSession, stopSport, deleteSport, analyzePhoto } = useSports(user?.id ?? null);
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
  const [analyzingKey, setAnalyzingKey] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, PhotoAnalysis>>({});
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [detailSport, setDetailSport] = useState<Sport | null>(null);
  const [kebabOpen, setKebabOpen] = useState<string | null>(null);
  const kebabRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const sportsRef = useRef<Sport[]>([]);
  useEffect(() => { sportsRef.current = sports; }, [sports]);

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

  const analyzeSportPhoto = useCallback(async (sport: Sport, photoId: string) => {
    const key = `${sport.id}:${photoId}`;
    setAnalyzingKey(key);
    setAnalysisError(null);
    try {
      const result = await analyzePhoto(sport.id, photoId);
      setAnalysisResults((prev) => ({ ...prev, [sport.id]: result }));
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Could not analyze the photo");
    } finally {
      setAnalyzingKey(null);
    }
  }, [analyzePhoto]);

  const handleProgressPhoto = useCallback(async (file: File | undefined) => {
    if (!file || !photoTarget) return;
    setPhotoBusy(true);
    try { const url = await resizeImageFile(file); await addPhoto(photoTarget.id, url, new Date().toLocaleDateString());
      toast({ type: "success", title: "Photo saved", message: "Progress photo added." });
      const target = photoTarget;
      setPhotoTarget(null);
      void fetchSports().then(() => {
        const latest = sportsRef.current.find((s) => s.id === target.id)?.photos?.slice(-1)[0];
        if (latest) void analyzeSportPhoto(target, latest.id);
      });
    } catch (e) { toast({ type: "error", title: "Photo failed", message: e instanceof Error ? e.message : "Try again" }); }
    finally { setPhotoBusy(false); if (photoInputRef.current) photoInputRef.current.value = ""; }
  }, [photoTarget, addPhoto, toast, fetchSports]);

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
            const today = new Date();
            const isMonday = today.getDay() === 1;
            const photoDue = Boolean(sport.photoDue) || (isMonday && active);
            const todayWd = today.getDay();
            const todayDay = sport.workoutDays?.find((d) => d.weekday === todayWd);
            return (
              <Card key={sport.id} className={`sport-card ${!active ? "is-stopped" : ""}`} padding="none" style={{ borderRadius: "16px" }}>
                {/* 1. Header */}
                <div className="px-5 pt-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                        <Dumbbell size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold leading-tight">{sport.name === "Gym" ? "go to gym regularly" : sport.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sport.daysPerWeek}x / week · Rest {sport.restSeconds}s · {sport.untilStopped ? "Until stopped" : `${sport.durationMonths} month${sport.durationMonths === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={active ? "success" : "outline"} className="rounded-full px-3 py-1 font-semibold uppercase tracking-wider text-[10px]">
                      {active ? "Active" : "Stopped"}
                    </Badge>
                  </div>
                </div>

                {/* Monday Photo Prompt */}
                {photoDue && active && (
                  <div className="mx-5 mt-4 flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3 text-primary border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Camera size={18} />
                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-tight">Monday Analysis</span>
                        <span className="text-[10px] opacity-80 font-bold">Add photo for body structure check</span>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-primary text-white h-8 text-[10px] font-black px-4 hover:bg-primary-hover"
                      loading={photoBusy && photoTarget?.id === sport.id}
                      onClick={() => openPhotoPicker(sport)}
                    >
                      Add photo
                    </Button>
                  </div>
                )}

                {/* 2. Week tracker */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    {ORDER.map((wd, i) => {
                      const isTraining = sport.commitmentDays?.includes(wd) || sport.workoutDays?.some((d) => d.weekday === wd);
                      const isToday = wd === todayWd;
                      const hasDone = sport.sessions?.some((s) => {
                        const d = new Date(s.startedAt);
                        return d.getDay() === wd && d.toDateString() === new Date().toDateString();
                      });

                      let bgClass = "border-2 border-border bg-transparent";
                      if (hasDone) bgClass = "bg-success border-success";
                      else if (isToday) bgClass = "bg-primary border-primary ring-4 ring-primary/20";
                      else if (isTraining) bgClass = "bg-secondary border-secondary";

                      return (
                        <div key={i} className="flex flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-muted-foreground">{DAY_ABBR[ORDER.indexOf(wd)]}</span>
                          <div
                            className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${bgClass}`}
                            title={DAY_FULL[wd]}
                          >
                            {hasDone && <Check size={14} className="text-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Stats */}
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-bg/40 p-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Workouts</span>
                      <strong className="text-lg leading-tight">{sport.analysis?.totalWorkouts ?? 0}</strong>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Consistency</span>
                      <strong className="text-lg leading-tight">{sport.analysis?.consistency ?? 0}%</strong>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avg time</span>
                      <strong className="text-lg leading-tight">{sport.analysis?.averageMinutes ?? 0}m</strong>
                    </div>
                  </div>
                </div>

                {/* 4. Today section */}
                <div className="border-t border-border px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold">
                      Today · {todayDay ? (todayDay.title || DAY_FULL[todayWd]) : "Rest day"}
                    </h4>
                    {todayDay && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {todayDay.exercises.length} exercises
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {todayDay?.exercises?.map((ex, idx) => {
                      const reps = ex.reps.replace(/\\u00D7/g, "×");
                      return (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                          <span className="text-sm font-medium">{ex.name}</span>
                          <span className="text-xs text-muted-foreground font-bold">{ex.sets} × {ex.reps}</span>
                        </div>
                      );
                    })}
                    {!todayDay && <p className="text-sm text-muted-foreground italic">Enjoy your rest day!</p>}
                  </div>
                </div>

                {/* 5. Progress photos */}
                <div className="border-t border-border px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold">Progress photos</h4>
                    <span className="text-xs text-muted-foreground font-medium">{sport.photos.length} photos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {sport.photos.slice(0, 3).map((p) => (
                      <button key={p.id} type="button" className="h-12 w-12 overflow-hidden rounded-lg border border-border bg-bg" onClick={() => setDetailSport(sport)}>
                        <img src={p.image} alt="Progress" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    {sport.photos.length === 0 && <div className="h-12 w-12 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground"><ImageIcon size={16} /></div>}
                  </div>
                </div>

                {/* 6. Actions */}
                <div className="mt-auto border-t border-border px-5 py-5">
                  <div className="flex items-center gap-2">
                    {active ? (
                      <>
                        <Button onClick={() => startWorkout(sport)} className="flex-1 bg-primary text-white hover:bg-primary-hover">
                          <Play size={16} fill="currentColor" /> Start workout
                        </Button>
                        <Button variant="outline" className="shrink-0 px-3" onClick={() => openPhotoPicker(sport)}>
                          <Camera size={18} />
                        </Button>
                        <Button variant="outline" className="shrink-0 px-3" onClick={() => setDetailSport(sport)}>
                          Details
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="secondary" onClick={() => setStoppedSummary(sport)} className="flex-1">
                          <TrendingUp size={16} /> Analysis
                        </Button>
                        <Button variant="outline" className="shrink-0 px-3" onClick={() => setDetailSport(sport)}>
                          Details
                        </Button>
                      </>
                    )}
                    <div className="relative" ref={kebabRef}>
                      <Button variant="ghost" className="px-2" onClick={() => setKebabOpen(kebabOpen === sport.id ? null : sport.id)}>
                        <MoreVertical size={18} />
                      </Button>
                      {kebabOpen === sport.id && (
                        <div className="absolute bottom-full right-0 mb-2 w-48 rounded-xl border border-border bg-bg-card p-1 shadow-lg z-10">
                          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => { setDetailSport(sport); setKebabOpen(null); }}>
                            <Copy size={14} /> Edit plan
                          </button>
                          {!active && (
                            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => { setStoppedSummary(sport); setKebabOpen(null); }}>
                              <TrendingUp size={14} /> View analysis
                            </button>
                          )}
                          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-bg" onClick={() => { setStopTarget(sport); setKebabOpen(null); }}>
                            <Square size={14} /> Stop sport
                          </button>
                          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-bg" onClick={() => { setDeleteTarget(sport); setKebabOpen(null); }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
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
            <Input label="Sport name" placeholder="e.g., go to gym regularly, Running" value={sportName} onChange={(e) => setSportName(e.target.value)} maxLength={60} required />
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
      <Modal 
        isOpen={Boolean(workoutSport)} 
        onClose={cancelWorkout} 
        title={workoutSport ? `Workout: ${workoutSport.name}` : "Workout"} 
        size="md"
        hideHeader // We'll render our own header
      >
        {workoutSport && (() => {
          const dayPlan = workoutSport.workoutDays?.[workoutDayIndex];
          if (!dayPlan) return <p>No workout planned for this day.</p>;
          const totalEx = dayPlan.exercises.length;
          const doneEx = completedExercises.size;
          const progress = totalEx > 0 ? (doneEx / totalEx) * 100 : 0;

          return (
            <div className="flex flex-col gap-5 p-1">
              {/* 1. Custom Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Workout: {workoutSport.name}</h2>
                <button onClick={cancelWorkout} className="p-2 hover:bg-bg rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* 2. Timer + Day selector */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-xl font-mono text-2xl font-black text-primary">
                  <Timer size={20} />
                  <span>{formatElapsed(elapsed)}</span>
                </div>
                {workoutSport.workoutDays!.length > 1 && (
                  <select
                    className="flex-1 h-[52px] px-4 rounded-xl border border-border bg-bg-card text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                    value={workoutDayIndex}
                    onChange={(e) => {
                      setWorkoutDayIndex(Number(e.target.value));
                      setCompletedExercises(new Set());
                      setRestLeft(-1);
                    }}
                  >
                    {workoutSport.workoutDays!.map((d, i) => (
                      <option key={i} value={i}>{DAY_FULL[d.weekday]}: {d.title || DAY_FULL[d.weekday]}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 3. Progress Section */}
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground font-medium">
                  Tick each exercise as you finish. Rest starts automatically.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-sm font-black tabular-nums">{doneEx} / {totalEx}</span>
                </div>
              </div>

              {/* Rest Timer Overlay/Alert */}
              {restLeft > 0 && (
                <div className="flex items-center justify-between bg-info-bg text-info px-4 py-3 rounded-xl animate-pulse">
                  <div className="flex items-center gap-2">
                    <Timer size={18} />
                    <span className="font-bold uppercase tracking-wider text-xs">Resting</span>
                    <strong className="text-lg font-black tabular-nums ml-1">{formatElapsed(restLeft)}</strong>
                  </div>
                  <button onClick={() => { setRestLeft(-1); restEndRef.current = null; }} className="text-xs font-bold underline">
                    Skip
                  </button>
                </div>
              )}

              {/* 4. Exercise list */}
              <div className="flex flex-col gap-2">
                {dayPlan.exercises.map((ex, idx) => {
                  const isDone = completedExercises.has(idx);
                  const reps = ex.reps.replace(/\\u00D7/g, "×");
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleExercise(idx)}
                      className={`group flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                        isDone ? "bg-success-bg border-success" : "bg-bg border-transparent hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isDone ? "bg-primary border-primary" : "bg-transparent border-muted-foreground/30 group-hover:border-primary/50"
                        }`}>
                          {isDone && <Check size={14} className="text-white" />}
                        </div>
                        <span className={`font-bold transition-all ${isDone ? "text-muted-foreground line-through" : "text-primary"}`}>
                          {ex.name}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-muted-foreground">{ex.sets} × {reps}</span>
                    </div>
                  );
                })}
              </div>

              {workoutError && <p className="text-sm text-danger font-bold">{workoutError}</p>}

              {/* 5. Finish Button */}
              <div className="mt-2">
                <Button
                  type="button"
                  loading={workoutSaving}
                  onClick={() => void finishWorkout()}
                  className="w-full h-14 bg-primary text-white rounded-xl text-lg font-black"
                >
                  <Check size={20} className="mr-2" /> Finish workout
                </Button>
                <button
                  onClick={cancelWorkout}
                  disabled={workoutSaving}
                  className="w-full py-3 text-sm font-bold text-muted-foreground hover:text-danger transition-colors mt-2"
                >
                  Discard workout
                </button>
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
                    {d.exercises.map((ex) => (<span className="exercise-pill" key={ex.name}>{ex.name} <small>{ex.sets} × {ex.reps}</small></span>))}
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
