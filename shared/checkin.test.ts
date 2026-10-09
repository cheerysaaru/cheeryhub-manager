import { describe, it, expect } from "vitest";
import {
  isCheckInEditable,
  todayInCheckinZone,
  shiftDayKey,
  CHECKIN_TIMEZONE,
} from "./checkin";

// Pin "now" to a moment whose Asia/Colombo calendar day we know.
// 2026-10-09T04:00:00Z is 2026-10-09 09:30 in Colombo (UTC+5:30) => today = 2026-10-09.
const NOW = new Date("2026-10-09T04:00:00.000Z");

describe("check-in editability (Asia/Colombo)", () => {
  it("computes today in Colombo, not UTC", () => {
    expect(todayInCheckinZone(NOW)).toBe("2026-10-09");
    expect(CHECKIN_TIMEZONE).toBe("Asia/Colombo");
  });

  it("today, yesterday and the day before are editable", () => {
    expect(isCheckInEditable("2026-10-09", NOW)).toBe(true); // today
    expect(isCheckInEditable("2026-10-08", NOW)).toBe(true); // yesterday
    expect(isCheckInEditable("2026-10-07", NOW)).toBe(true); // day before
  });

  it("four days ago is rejected", () => {
    expect(isCheckInEditable("2026-10-06", NOW)).toBe(false);
    expect(isCheckInEditable("2026-10-05", NOW)).toBe(false);
  });

  it("future dates are rejected", () => {
    expect(isCheckInEditable("2026-10-10", NOW)).toBe(false);
    expect(isCheckInEditable("2027-01-01", NOW)).toBe(false);
  });

  it("rejects malformed values", () => {
    expect(isCheckInEditable("", NOW)).toBe(false);
    expect(isCheckInEditable("2026-10-09T00:00:00Z", NOW)).toBe(false);
    expect(isCheckInEditable("not-a-date", NOW)).toBe(false);
  });

  it("shifts calendar days across month boundaries", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("uses the Colombo day even late on a UTC evening", () => {
    // 2026-10-09T20:00Z is already 2026-10-10 in Colombo (01:30).
    const lateEveningUTC = new Date("2026-10-09T20:00:00.000Z");
    expect(todayInCheckinZone(lateEveningUTC)).toBe("2026-10-10");
    // So 2026-10-08 (yesterday, Colombo) is editable, 2026-10-07 is not.
    expect(isCheckInEditable("2026-10-08", lateEveningUTC)).toBe(true);
    expect(isCheckInEditable("2026-10-07", lateEveningUTC)).toBe(false);
  });
});
