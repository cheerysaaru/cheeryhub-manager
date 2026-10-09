import { describe, it, expect } from "vitest";
import { todayInCheckinZone, shiftDayKey } from "../../../shared/checkin";

// Integration coverage that hits the running Worker (local or staging). Skipped
// by default; run with E2E_API set, e.g.
//   E2E_API=http://127.0.0.1:8787/api npx vitest run backend/src/routes/habits.checkin.test.ts
const API = process.env.E2E_API;

const maybe = API ? describe : describe.skip;

maybe("commitment check-in window (live worker)", () => {
  it("saves on today/yesterday/day-before, rejects older+future, persists after refresh", async () => {
    const email = `ci_${Date.now()}@example.com`;
    const req = async (
      method: string,
      path: string,
      token?: string,
      body?: unknown,
    ) => {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, data: await res.json().catch(() => null) };
    };

    const reg = await req("POST", "/auth/register", undefined, {
      name: "CI",
      email,
      password: "password123",
      timezone: "Asia/Colombo",
    });
    expect(reg.status).toBe(201);
    const token = reg.data?.data?.token as string;

    const habit = await req("POST", "/habits", token, {
      name: "CI Commitment",
      frequency: "daily",
    });
    expect(habit.status).toBe(201);
    const habitId = habit.data?.data?.id as string;

    const today = todayInCheckinZone();
    const editable = [shiftDayKey(today, -2), shiftDayKey(today, -1), today];

    for (const day of editable) {
      const first = await req("POST", `/habits/${habitId}/complete`, token, {
        date: day,
      });
      expect(first.status, `check-in ${day}`).toBe(200);
      expect(first.data?.data?.alreadyCheckedIn).toBe(false);
      // Idempotent: a repeat on the same day does not double-count.
      const again = await req("POST", `/habits/${habitId}/complete`, token, {
        date: day,
      });
      expect(again.status).toBe(200);
      expect(again.data?.data?.alreadyCheckedIn).toBe(true);
      expect(again.data?.data?.totalCompletions).toBe(
        first.data?.data?.totalCompletions,
      );
    }

    const tooOld = await req("POST", `/habits/${habitId}/complete`, token, {
      date: shiftDayKey(today, -4),
    });
    expect(tooOld.status).toBe(400);
    expect(tooOld.data?.error?.code).toBe("DATE_NOT_EDITABLE");

    const future = await req("POST", `/habits/${habitId}/complete`, token, {
      date: shiftDayKey(today, 1),
    });
    expect(future.status).toBe(400);
    expect(future.data?.error?.code).toBe("DATE_NOT_EDITABLE");

    // Survives refresh: re-reading the commitment returns the 3 checked days.
    const list = await req("GET", "/habits", token);
    expect(list.status).toBe(200);
    const stored = (list.data?.data ?? []).find(
      (h: { id: string }) => h.id === habitId,
    );
    // Backend list speaks `name`. A repeat check-in on today proves the earlier
    // writes persisted (survived a refresh): it returns already-checked-in.
    expect(stored).toBeTruthy();
    const persisted = await req("POST", `/habits/${habitId}/complete`, token, {
      date: today,
    });
    expect(persisted.status).toBe(200);
    expect(persisted.data?.data?.alreadyCheckedIn).toBe(true);
    expect(persisted.data?.data?.totalCompletions).toBe(editable.length);
  });
});
