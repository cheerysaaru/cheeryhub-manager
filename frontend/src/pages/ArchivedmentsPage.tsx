import { useMemo, useState } from "react";
import { Plus, Award, Archive, Trophy } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useGoals } from "../hooks/useGoals";
import { useToast } from "../components/Toast";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { ApiLoadError } from "../components/ApiLoadError";
import {
  readArchivedments,
  addArchivedment,
  type Archivedment,
} from "../utils/archivedments";
import { api, ApiError } from "../services/api";
import { achievementKeyFromTitle } from "../../../shared/achievements";
import { todayISO, parseLocalDate } from "../utils/date";

interface UnlockResult {
  id: string;
  key: string;
  name: string;
  /** Points the server just credited for this unlock. */
  xpAwarded: number;
}

function formatAchievedDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ArchivedmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { goals, error, fetchGoals } = useGoals(user?.id ?? null);
  const [items, setItems] = useState<Archivedment[]>(() => readArchivedments());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    emoji: "",
    title: "",
    description: "",
    date: todayISO(),
  });

  // Completed goals double as achievements even if they were never archived locally.
  const derivedFromGoals = useMemo<Archivedment[]>(
    () =>
      goals
        .filter((goal) => goal.progress >= 100 || goal.status === "COMPLETED")
        .filter((goal) => !items.some((item) => item.id === goal.id))
        .map((goal) => ({
          id: goal.id,
          emoji: "🏆",
          title: goal.title,
          description: goal.description ?? undefined,
          date: (goal.updatedAt ?? todayISO()).slice(0, 10),
          source: "goal" as const,
        })),
    [goals, items],
  );

  const visible = useMemo(
    () =>
      [...items, ...derivedFromGoals].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      ),
    [items, derivedFromGoals],
  );

  function openForm() {
    setForm({ emoji: "", title: "", description: "", date: todayISO() });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const title = form.title.trim();
    const description = form.description.trim();
    const date = form.date || todayISO();

    // Database first: the unlock (and its XP) only happen on the server, and
    // the local copy is written only after that save succeeded.
    const unlock = async (key: string) =>
      api<UnlockResult>("/achievements/unlock", {
        method: "POST",
        body: JSON.stringify({
          key,
          title,
          description: description || undefined,
          icon: form.emoji.trim() || undefined,
          date,
        }),
      });

    let saved: UnlockResult;
    try {
      saved = await unlock(achievementKeyFromTitle(title));
    } catch (caught) {
      // Same title unlocked before: that key is taken — give it a fresh one.
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          saved = await unlock(
            `${achievementKeyFromTitle(title)}-${Date.now().toString(36)}`,
          );
        } catch (retry) {
          toast({
            type: "error",
            title: "Achievement not saved",
            message:
              retry instanceof Error ? retry.message : "Please try again.",
          });
          return;
        }
      } else {
        toast({
          type: "error",
          title: "Achievement not saved",
          message:
            caught instanceof Error ? caught.message : "Please try again.",
        });
        return;
      }
    }

    addArchivedment({
      emoji: form.emoji.trim(),
      title,
      description,
      date,
    });
    setItems(readArchivedments());
    setShowForm(false);
    toast({
      type: "success",
      title: "Achievement added",
      message: `${title} · +${saved.xpAwarded} points`,
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">OVERVIEW / Achievements</p>
          <h1>Achievements</h1>
        </div>
        <Button size="lg" onClick={openForm}>
          <Plus size={20} /> Add Achievement
        </Button>
      </header>

      <ApiLoadError error={error} onRetry={() => void fetchGoals()} />
      {visible.length === 0 ? (
        <div className="empty-state">
          <Archive size={40} />
          <strong>No achievements yet</strong>
          <p>Add your first achievement, or complete a goal at 100%.</p>
          <Button onClick={openForm}>
            <Plus size={18} /> Add Achievement
          </Button>
        </div>
      ) : (
        <div className="skills-grid">
          {visible.map((item) => (
            <Card key={item.id} className="skill-card" padding="md">
              <div className="skill-header">
                <div className="skill-info">
                  <strong>
                    {item.emoji ? `${item.emoji} ` : ""}
                    {item.title}
                  </strong>
                  <span className="achievement-date">
                    {formatAchievedDate(item.date)}
                    {item.source === "goal" && (
                      <Trophy size={12} aria-label="From a completed goal" />
                    )}
                  </span>
                </div>
                <Award
                  size={18}
                  className="achievement-icon"
                  aria-hidden="true"
                />
              </div>
              {item.description && (
                <p className="achievement-desc">{item.description}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Add Achievement"
      >
        <form onSubmit={handleSubmit} className="modal-form">
          <Input
            label="Emoji (optional)"
            value={form.emoji}
            onChange={(e) =>
              setForm({ ...form, emoji: e.target.value.slice(0, 2) })
            }
            maxLength={2}
            placeholder="🏆"
          />
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Textarea
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
          <Input
            label="Date Achieved"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <div className="modal-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
