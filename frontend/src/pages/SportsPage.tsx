import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Dumbbell,
  Camera,
  Play,
  Square,
  Trash2,
  Check,
  Timer,
  TrendingUp,
  CalendarDays,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSports, type Sport } from "../hooks/useSports";
import { usePoints } from "../hooks/usePoints";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Modal } from "../components/Modal";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Checkbox } from "../components/Checkbox";
import { ApiLoadError } from "../components/ApiLoadError";
import { useToast } from "../components/Toast";
import { audioAlert } from "../utils/notify";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

interface ExerciseDraft {
  name: string;
  sets: number;
  reps: string;
}

const blankExercise = (): ExerciseDraft => ({ name: "", sets: 3, reps: "10" });

function pad(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${pad(total % 60)}s`;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file"));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("Image is too large (max 12MB)"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read that image"));
      image.onload = () => {
        const maxSize = 760;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas is not supported"));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function SportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { sports, loading, error, fetchSports, createSport, addPhoto, saveSession, stopSport, deleteSport } = useSports(user?.id ?? null);
  const { points, refresh: refreshPoints } = usePoints(user?.id ?? null);

  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sportName, setSportName] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [durationValue, setDurationValue] = useState("1");
  const [untilStopped, setUntilStopped] = useState(false);
  const [restSeconds, setRestSeconds] = useState(60);
  const [exerciseDrafts, setExerciseDrafts] = useState<ExerciseDraft[]>([blankExercise()]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [dailyCommitments, setDailyCommitments] = useState(false);
  const [commitmentDays, setCommitmentDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeklyPhotoReminderKey, setWeeklyPhotoReminderKey] = useState<string>("");

  const [workoutSport, setWorkoutSport] = useState<Sport | null>(null);
  const [workoutStartedAt, setWorkoutStartedAt] = useState<Date | null>(null);
  const [workoutNow, setWorkoutNow] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(new Set());
  const [restLeft, setRestLeft] = useState(-1);
  const [workoutSaving, setWorkoutSaving] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const [stopTarget, setStopTarget] = useState<Sport | null>(null);
  const [stoppedSummary, setStoppedSummary] = useState<Sport | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sport | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<Sport | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [detailSport, setDetailSport] = useState<Sport | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void refreshPoints();
  }, [refreshPoints]);

  useEffect(() => {
    if (!workoutStartedAt) return;
    const timer = window.setInterval(() => setWorkoutNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [workoutStartedAt]);

  useEffect(() => {
    if (restLeft <= 0) return;
    const timer = window.setInterval(() => {
      setRestLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restLeft]);

  useEffect(() => {
    if (restLeft !== 0) return;
    if (!workoutStartedAt) return;
    audioAlert();
    if ("vibrate" in navigator) navigator.vibrate([180, 90, 180]);
  }, [restLeft, workoutStartedAt]);

  const resetSetup = useCallback(() => {
    setSetupStep(0);
    setSetupError(null);
    setSportName("");
    setDaysPerWeek(3);
    setDurationValue("1");
    setUntilStopped(false);
    setRestSeconds(60);
    setExerciseDrafts([blankExercise()]);
    setPhotoPreview(null);
    setDailyCommitments(false);
    setCommitmentDays([1, 2, 3, 4, 5]);
    setWeeklyPhotoReminderKey(String(Date.now()));
  }, []);

  const openSetup = useCallback(() => {
    resetSetup();
    setShowSetup(true);
  }, [resetSetup]);

  const elapsed = workoutStartedAt
    ? Math.max(0, Math.floor((workoutNow - workoutStartedAt.getTime()) / 1000))
    : 0;

  const handlePhotoFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file);
      setPhotoPreview(dataUrl);
    } catch (caught) {
      setSetupError(caught instanceof Error ? caught.message : "Could not read image");
    }
  }, []);

  const validateStepOne = useCallback((): boolean => {
    if (!sportName.trim() || sportName.trim().length < 2) {
      setSetupError("Enter a sport name");
      return false;
    }
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
      setSetupError("Workout days must be between 1 and 7 per week");
      return false;
    }
    if (!untilStopped && (!Number.isInteger(Number(durationValue)) || Number(durationValue) < 1 || Number(durationValue) > 24)) {
      setSetupError("Duration must be 1-24 months");
      return false;
    }
    return true;
  }, [sportName, daysPerWeek, untilStopped, durationValue]);

  const validateStepTwo = useCallback((): boolean => {
    const cleaned = exerciseDrafts.filter((exercise) => exercise.name.trim());
    if (cleaned.length === 0) {
      setSetupError("Add at least one exercise");
      return false;
    }
    for (const exercise of cleaned) {
      if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 30) {
        setSetupError("Sets must be between 1 and 30");
        return false;
      }
      if (!exercise.reps.trim() || exercise.reps.trim().length > 30) {
        setSetupError("Add reps or time for each exercise");
        return false;
      }
    }
    return true;
  }, [exerciseDrafts]);

  const goNext = useCallback(() => {
    setSetupError(null);
    if (setupStep === 0 && !validateStepOne()) return;
    if (setupStep === 1 && !validateStepTwo()) return;
    setSetupStep((step) => Math.min(2, step + 1));
  }, [setupStep, validateStepOne, validateStepTwo]);

  const handleCreate = useCallback(async () => {
    setSetupError(null);
    if (!validateStepOne() || !validateStepTwo()) {
      setSetupStep(0);
      return;
    }
    if (dailyCommitments && commitmentDays.length === 0) {
      setSetupError("Pick at least one commitment day");
      return;
    }
    setSubmitting(true);
    try {
      await createSport({
        name: sportName.trim(),
        daysPerWeek,
        durationMonths: untilStopped ? null : Number(durationValue),
        untilStopped,
        restSeconds,
        exercises: exerciseDrafts
          .filter((exercise) => exercise.name.trim())
          .map((exercise) => ({
            name: exercise.name.trim(),
            sets: exercise.sets,
            reps: exercise.reps.trim(),
          })),
        photo: photoPreview,
        dailyCommitments,
        commitmentDays,
      });
      setShowSetup(false);
      resetSetup();
      await refreshPoints();
      toast({ type: "success", title: "Sport added", message: "Your gym setup is ready. Start a workout when you're ready." });
    } catch (caught) {
      setSetupError(caught instanceof Error ? caught.message : "Could not create sport");
    } finally {
      setSubmitting(false);
    }
  }, [sportName, daysPerWeek, untilStopped, durationValue, restSeconds, exerciseDrafts, photoPreview, dailyCommitments, commitmentDays, createSport, resetSetup, refreshPoints, toast, validateStepOne, validateStepTwo]);

  const startWorkout = useCallback((sport: Sport) => {
    setWorkoutSport(sport);
    setWorkoutStartedAt(new Date());
    setWorkoutNow(Date.now());
    setCompletedExercises(new Set());
    setRestLeft(-1);
    setWorkoutError(null);
  }, []);

  const toggleExercise = useCallback((index: number, sport: Sport) => {
    setCompletedExercises((previous) => {
      const next = new Set(previous);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        if ((sport.restSeconds || 60) > 0) {
          setRestLeft(sport.restSeconds || 60);
        }
      }
      return next;
    });
  }, []);

  const finishWorkout = useCallback(async () => {
    if (!workoutSport || !workoutStartedAt) return;
    setWorkoutSaving(true);
    setWorkoutError(null);
    const endedAt = new Date();
    try {
      await saveSession(
        workoutSport.id,
        workoutStartedAt.toISOString(),
        endedAt.toISOString(),
        workoutSport.exercises.filter((_, index) => completedExercises.has(index)).map((exercise) => exercise.name),
      );
      await refreshPoints();
      toast({ type: "success", title: "Workout saved", message: "+15 points. Keep the streak going." });
      setWorkoutSport(null);
      setWorkoutStartedAt(null);
      setRestLeft(-1);
    } catch (caught) {
      setWorkoutError(caught instanceof Error ? caught.message : "Could not save workout");
    } finally {
      setWorkoutSaving(false);
    }
  }, [workoutSport, workoutStartedAt, completedExercises, saveSession, refreshPoints, toast]);

  const cancelWorkout = useCallback(() => {
    if (workoutSaving) return;
    setWorkoutSport(null);
    setWorkoutStartedAt(null);
    setRestLeft(-1);
    setCompletedExercises(new Set());
    setWorkoutError(null);
  }, [workoutSaving]);

  const handleStop = useCallback(async () => {
    if (!stopTarget) return;
    setStopBusy(true);
    try {
      const stopped = await stopSport(stopTarget.id);
      setStopTarget(null);
      setStoppedSummary(stopped);
      toast({ type: "success", title: "Sport stopped", message: "Your final analysis is ready." });
    } catch (caught) {
      toast({ type: "error", title: "Could not stop sport", message: caught instanceof Error ? caught.message : "Try again" });
    } finally {
      setStopBusy(false);
    }
  }, [stopTarget, stopSport, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteSport(deleteTarget.id);
      setDeleteTarget(null);
      await refreshPoints();
      toast({ type: "success", title: "Sport deleted", message: "Sport removed successfully" });
    } catch (caught) {
      toast({ type: "error", title: "Delete failed", message: caught instanceof Error ? caught.message : "Try again" });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, deleteSport, refreshPoints, toast]);

  const openPhotoPicker = useCallback((sport: Sport) => {
    setPhotoTarget(sport);
    photoInputRef.current?.click();
  }, []);

  const handleProgressPhoto = useCallback(async (file: File | undefined) => {
    if (!file || !photoTarget) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      await addPhoto(photoTarget.id, dataUrl, new Date().toLocaleDateString());
      toast({ type: "success", title: "Progress photo saved", message: "Photo added to your timeline." });
      setPhotoTarget(null);
    } catch (caught) {
      toast({ type: "error", title: "Photo failed", message: caught instanceof Error ? caught.message : "Try again" });
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }, [photoTarget, addPhoto, toast]);

  const stats = useMemo(() => {
    const active = sports.filter((sport) => Boolean(sport.active)).length;
    const workouts = sports.reduce((sum, sport) => sum + (sport.analysis?.totalWorkouts ?? 0), 0);
    return { active, workouts };
  }, [sports]);

  const addExercise = () => setExerciseDrafts((drafts) => [...drafts, blankExercise()]);
  const removeExercise = (index: number) =>
    setExerciseDrafts((drafts) => (drafts.length <= 1 ? drafts : drafts.filter((_, entryIndex) => entryIndex !== index)));
  const updateExercise = (index: number, patch: Partial<ExerciseDraft>) =>
    setExerciseDrafts((drafts) => drafts.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));

  const toggleCommitmentDay = (value: number) => {
    setCommitmentDays((days) => (days.includes(value) ? days.filter((day) => day !== value) : [...days, value]));
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SPORTS</p>
          <h1>Gym &amp; training</h1>
          <p className="header-date">
            {stats.active} active Ã‚Â· {stats.workouts} workouts logged
            {points ? ` Ã‚Â· ${points.currentTotal} pts Ã‚Â· Level ${points.level}` : ""}
          </p>
        </div>
        <Button size="lg" onClick={openSetup}>
          <Plus size={20} /> Add Sport
        </Button>
      </header>

      <ApiLoadError error={error} onRetry={() => void fetchSports()} />

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void handleProgressPhoto(event.target.files?.[0])}
      />

      {loading ? (
        <div className="page-loading">Loading sports...</div>
      ) : sports.length === 0 ? (
        <div className="empty-state">
          <Dumbbell size={40} />
          <strong>No sports yet</strong>
          <p>Set up gym, add your exercises, and track every workout with progress photos.</p>
          <Button onClick={openSetup}>
            <Plus size={18} /> Add Sport
          </Button>
        </div>
      ) : (
        <div className="sports-grid">
          {sports.map((sport) => {
            const analysis = sport.analysis;
            const active = Boolean(sport.active);
            const photoDue = Boolean(sport.photoDue);
            const latestPhoto = sport.photos[0];
            return (
              <Card key={sport.id} className={`sport-card ${active ? "" : "is-stopped"}`} padding="md">
                <div className="sport-card-top">
                  <div className="sport-heading">
                    <span className="sport-icon"><Dumbbell size={18} /></span>
                    <div>
                      <strong>{sport.name}</strong>
                      <p className="sport-meta">
                        {sport.daysPerWeek}x / week · Rest {sport.restSeconds}s ·{" "}
                        {sport.untilStopped ? "Until stopped" : `${sport.durationMonths} month${Number(sport.durationMonths) === 1 ? "" : "s"}`}
                        {sport.dailyCommitments && Array.isArray(sport.commitmentDays) && sport.commitmentDays.length > 0 && (
                          <> · Commitments: {sport.commitmentDays.map((d: number) => DAY_LABELS[DAY_VALUES.indexOf(d)] || "").filter(Boolean).join(", ")}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="sport-badges">
                    <Badge variant={active ? "success" : "outline"} size="sm">{active ? "Active" : "Stopped"}</Badge>
                    {photoDue && active && <Badge variant="warning" size="sm">Photo due</Badge>}
                  </div>
                </div>

                <div className="sport-stats">
                  <div className="sport-stat">
                    <span>Workouts</span>
                    <strong>{analysis?.totalWorkouts ?? 0}</strong>
                  </div>
                  <div className="sport-stat">
                    <span>Consistency</span>
                    <strong>{analysis?.consistency ?? 0}%</strong>
                  </div>
                  <div className="sport-stat">
                    <span>Avg time</span>
                    <strong>{analysis?.averageMinutes ?? 0}m</strong>
                  </div>
                </div>

                {photoDue && active && (
                  <div className="sport-photo-due">
                    <Camera size={16} />
                    <span>Time for a new progress photo</span>
                    <Button variant="secondary" size="sm" loading={photoBusy && photoTarget?.id === sport.id} onClick={() => openPhotoPicker(sport)}>
                      Add photo
                    </Button>
                  </div>
                )}

                <div className="sport-exercises">
                  {sport.exercises.map((exercise) => (
                    <span className="exercise-pill" key={exercise.id ?? exercise.name}>
                      {exercise.name} <small>{exercise.sets}Ãƒâ€”{exercise.reps}</small>
                    </span>
                  ))}
                </div>

                {sport.photos.length > 0 && (
                  <div className="sport-photos">
                    {sport.photos.slice(0, 3).map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        className="sport-photo-thumb"
                        onClick={() => setDetailSport(sport)}
                        title={photo.label ? new Date(photo.createdAt).toLocaleDateString() : "Progress photo"}
                      >
                        <img src={photo.image} alt="Progress" />
                      </button>
                    ))}
                    <span className="photo-count"><ImageIcon size={12} /> {sport.photos.length}</span>
                  </div>
                )}
                {latestPhoto == null && active && (
                  <p className="sport-hint">Add a starting photo so you can see your progress later.</p>
                )}

                <div className="sport-actions">
                  {active ? (
                    <>
                      <Button onClick={() => startWorkout(sport)}>
                        <Play size={16} /> Start Workout
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openPhotoPicker(sport)}>
                        <Camera size={14} /> Photo
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDetailSport(sport)}>
                        Details
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setStopTarget(sport)}>
                        <Square size={14} /> Stop
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => setStoppedSummary(sport)}>
                        <TrendingUp size={16} /> View analysis
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDetailSport(sport)}>
                        Details
                      </Button>
                    </>
                  )}
                  <Button variant="danger" size="sm" className="sport-delete" onClick={() => setDeleteTarget(sport)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showSetup}
        onClose={() => { setShowSetup(false); resetSetup(); }}
        title="Set up a sport"
        size="lg"
      >
        <div className="sport-stepper">
          {[0, 1, 2].map((step) => (
            <span key={step} className={`sport-step ${setupStep === step ? "active" : ""} ${setupStep > step ? "done" : ""}`}>
              {setupStep > step ? <Check size={12} /> : step + 1}
            </span>
          ))}
        </div>

        {setupStep === 0 && (
          <div className="modal-form">
            <Input
              label="Sport name"
              placeholder="e.g., Gym, Running, Swimming"
              value={sportName}
              onChange={(event) => setSportName(event.target.value)}
              maxLength={60}
              required
            />
            <div className="form-row">
              <Input
                label="Workout days per week"
                type="number"
                min="1"
                max="7"
                value={daysPerWeek}
                onChange={(event) => setDaysPerWeek(Math.max(1, Math.min(7, parseInt(event.target.value) || 1)))}
                required
              />
              <div className="day-chips">
                {[2, 3, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`day-chip ${daysPerWeek === value ? "active" : ""}`}
                    onClick={() => setDaysPerWeek(value)}
                  >
                    {value}x
                  </button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <Select
                label="Duration"
                value={untilStopped ? "until" : durationValue}
                onChange={(event) => {
                  if (event.target.value === "until") {
                    setUntilStopped(true);
                  } else {
                    setUntilStopped(false);
                    setDurationValue(event.target.value);
                  }
                }}
                options={[
                  { value: "1", label: "1 month" },
                  { value: "2", label: "2 months" },
                  { value: "3", label: "3 months" },
                  { value: "6", label: "6 months" },
                  { value: "12", label: "12 months" },
                  { value: "until", label: "Until I stop it" },
                ]}
              />
              <Input
                label="Rest between exercises (seconds)"
                type="number"
                min="0"
                max="600"
                value={restSeconds}
                onChange={(event) => setRestSeconds(Math.max(0, Math.min(600, parseInt(event.target.value) || 0)))}
              />
            </div>
            {setupError && <p className="form-error">{setupError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => { setShowSetup(false); resetSetup(); }}>Cancel</Button>
              <Button type="button" onClick={goNext}>Next: exercises</Button>
            </div>
          </div>
        )}

        {setupStep === 1 && (
          <div className="modal-form">
            <div className="exercise-editor-head">
              <strong>Exercises</strong>
              <Button type="button" variant="secondary" size="sm" onClick={addExercise}>
                <Plus size={14} /> Add exercise
              </Button>
            </div>
            <div className="exercise-editor">
              {exerciseDrafts.map((exercise, index) => (
                <div className="exercise-row" key={index}>
                  <Input
                    placeholder="Exercise name"
                    value={exercise.name}
                    onChange={(event) => updateExercise(index, { name: event.target.value })}
                  />
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    placeholder="Sets"
                    value={exercise.sets}
                    onChange={(event) => updateExercise(index, { sets: Math.max(1, Math.min(30, parseInt(event.target.value) || 1)) })}
                  />
                  <Input
                    placeholder="Reps / time"
                    value={exercise.reps}
                    onChange={(event) => updateExercise(index, { reps: event.target.value })}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeExercise(index)} aria-label="Remove exercise">
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
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
                {photoPreview ? <img src={photoPreview} alt="Setup preview" /> : <ImageIcon size={28} />}
              </div>
              <div>
                <strong>Starting photo</strong>
                <p className="sport-hint">Optional. A photo every week keeps progress visible.</p>
                <label className="photo-picker-button">
                  <Camera size={14} /> Choose photo
                  <input
                    key={weeklyPhotoReminderKey || "photo"}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => void handlePhotoFile(event.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            <Checkbox
              label="Add to daily commitments"
              description="Creates a commitment so this sport shows up with your daily promises."
              checked={dailyCommitments}
              onChange={(event) => setDailyCommitments(event.target.checked)}
            />
            {dailyCommitments && (
              <div className="commitment-day-picker">
                {DAY_LABELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`commitment-day ${commitmentDays.includes(DAY_VALUES[index]) ? "active" : ""}`}
                    onClick={() => toggleCommitmentDay(DAY_VALUES[index])}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {setupError && <p className="form-error">{setupError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setSetupStep(1)}>Back</Button>
              <Button type="button" loading={submitting} onClick={() => void handleCreate()}>
                <Check size={16} /> Create sport
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(workoutSport)} onClose={cancelWorkout} title={workoutSport ? `Workout: ${workoutSport.name}` : "Workout"} size="md">
        {workoutSport && (
          <div className="workout-runner">
            <div className="workout-timer">
              <Timer size={20} />
              <span>{formatElapsed(elapsed)}</span>
            </div>

            {restLeft > 0 ? (
              <div className="rest-timer">
                <p>Rest</p>
                <strong>{formatElapsed(restLeft)}</strong>
                <Button variant="ghost" size="sm" onClick={() => setRestLeft(-1)}>Skip rest</Button>
              </div>
            ) : (
              <p className="workout-hint">Tick each exercise as you finish it. Rest starts automatically.</p>
            )}

            <div className="workout-exercises">
              {workoutSport.exercises.map((exercise, index) => (
                <label key={exercise.id ?? index} className={`workout-exercise ${completedExercises.has(index) ? "done" : ""}`}>
                  <Checkbox
                    checked={completedExercises.has(index)}
                    onChange={() => toggleExercise(index, workoutSport)}
                  />
                  <span className="workout-exercise-name">{exercise.name}</span>
                  <span className="workout-exercise-plan">{exercise.sets}Ãƒâ€”{exercise.reps}</span>
                </label>
              ))}
            </div>

            {workoutError && <p className="form-error">{workoutError}</p>}
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={cancelWorkout} disabled={workoutSaving}>Discard</Button>
              <Button type="button" loading={workoutSaving} onClick={() => void finishWorkout()}>
                <Square size={14} /> End &amp; save
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(stopTarget)} onClose={() => setStopTarget(null)} title="Stop this sport?">
        <p>
          Stopping <strong>{stopTarget?.name}</strong> ends tracking and shows your final analysis. You can still view the data afterwards.
        </p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setStopTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={stopBusy} onClick={() => void handleStop()}>
            <Square size={14} /> Stop sport
          </Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete this sport?">
        <p>
          Delete <strong>{deleteTarget?.name}</strong>? Workouts, photos and its achievement will be removed. This cannot be undone.
        </p>
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteBusy} onClick={() => void handleDelete()}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(stoppedSummary)}
        onClose={() => setStoppedSummary(null)}
        title={stoppedSummary ? `${stoppedSummary.name} Ã¢â‚¬â€ final analysis` : "Analysis"}
      >
        {stoppedSummary && <SportAnalysisBlock sport={stoppedSummary} />}
        <div className="modal-actions">
          <Button onClick={() => setStoppedSummary(null)}>Close</Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(detailSport)}
        onClose={() => setDetailSport(null)}
        title={detailSport ? detailSport.name : "Sport details"}
        size="lg"
      >
        {detailSport && (
          <div className="sport-details">
            <SportAnalysisBlock sport={detailSport} />
            <div className="details-section">
              <h4><Dumbbell size={15} /> Exercises</h4>
              <div className="sport-exercises">
                {detailSport.exercises.map((exercise) => (
                  <span className="exercise-pill" key={exercise.id ?? exercise.name}>
                    {exercise.name} <small>{exercise.sets}Ãƒâ€”{exercise.reps}</small>
                  </span>
                ))}
              </div>
            </div>
            <div className="details-section">
              <h4><CalendarDays size={15} /> Progress photos</h4>
              {detailSport.photos.length === 0 ? (
                <p className="sport-hint">No photos yet.</p>
              ) : (
                <div className="photo-timeline">
                  {detailSport.photos.map((photo) => (
                    <figure key={photo.id}>
                      <img src={photo.image} alt="Progress" />
                      <figcaption>{new Date(photo.createdAt).toLocaleDateString()}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
            {detailSport.sessions.length > 0 && (
              <div className="details-section">
                <h4><Timer size={15} /> Recent workouts</h4>
                <ul className="session-list">
                  {detailSport.sessions.slice(0, 8).map((session) => (
                    <li key={session.id}>
                      <span>{new Date(session.startedAt).toLocaleDateString()}</span>
                      <strong>{formatDuration(session.durationSeconds)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="modal-actions">
          <Button onClick={() => setDetailSport(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

function SportAnalysisBlock({ sport }: { sport: Sport }) {
  const analysis = sport.analysis;
  return (
    <div className="sport-analysis">
      <div className="analysis-grid">
        <div><span>Total workouts</span><strong>{analysis?.totalWorkouts ?? 0}</strong></div>
        <div><span>Total time</span><strong>{analysis?.totalMinutes ?? 0}m</strong></div>
        <div><span>Average workout</span><strong>{analysis?.averageMinutes ?? 0}m</strong></div>
        <div><span>Consistency</span><strong>{analysis?.consistency ?? 0}%</strong></div>
      </div>
      {sport.photos.length > 0 && (
        <div className="analysis-photos">
          <figure>
            <img src={(analysis.latestPhoto ?? sport.photos[0]).image} alt="Latest progress" />
            <figcaption>Latest</figcaption>
          </figure>
          {sport.photos.length > 1 && (
            <figure>
              <img src={(analysis.firstPhoto ?? sport.photos[sport.photos.length - 1]).image} alt="First progress" />
              <figcaption>Starting point</figcaption>
            </figure>
          )}
        </div>
      )}
      <p className="sport-hint">
        {sport.active
          ? "Stop the sport to lock in your final analysis."
          : `Finished after ${analysis?.finishedInDays ?? 0} day(s).`}
      </p>
    </div>
  );
}
