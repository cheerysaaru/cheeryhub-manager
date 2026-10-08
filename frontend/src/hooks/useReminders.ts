import { useCallback, useEffect, useState } from "react";
import { api, asArray } from "../services/api";
import type { Reminder } from "../types";
import { useSocket } from "./useSocket";

export function useReminders(userId: string | null) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);

  const loadReminders = useCallback(() => {
    return api<Reminder[]>("/reminders")
      .then((data) => {
        setReminders(
          asArray<Reminder>(data).filter((reminder): reminder is Reminder =>
            Boolean(
              reminder &&
              typeof reminder === "object" &&
              typeof reminder.id === "string" &&
              typeof reminder.title === "string" &&
              typeof reminder.reminderDate === "string",
            ),
          ),
        );
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load reminders.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const fetchReminders = useCallback(() => {
    setError(null);
    return loadReminders();
  }, [loadReminders]);

  useEffect(() => {
    loadReminders();
    const cleanup = on<Reminder>("reminder:created", (reminder) => {
      setReminders((prev) =>
        prev.some((r) => r.id === reminder.id) ? prev : [reminder, ...prev],
      );
    });
    const cleanup2 = on<Reminder>("reminder:updated", (reminder) => {
      setReminders((prev) =>
        prev.map((r) => (r.id === reminder.id ? reminder : r)),
      );
    });
    const cleanup3 = on<{ id: string }>("reminder:deleted", ({ id }) => {
      setReminders((prev) => prev.filter((r) => r.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [loadReminders, on]);

  const create = useCallback(async (data: Partial<Reminder>) => {
    const reminder = await api<Reminder>("/reminders", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setReminders((prev) =>
      prev.some((r) => r.id === reminder.id) ? prev : [reminder, ...prev],
    );
    return reminder;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Reminder>) => {
    const reminder = await api<Reminder>(`/reminders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setReminders((prev) => prev.map((r) => (r.id === id ? reminder : r)));
    return reminder;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/reminders/${id}`, { method: "DELETE" });
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { reminders, loading, error, fetchReminders, create, update, remove };
}
