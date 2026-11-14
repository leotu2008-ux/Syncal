import { describe, expect, it } from "vitest";
import {
  dayKey,
  eventDayKeys,
  groupByDay,
  monthGridStart,
  startOfWeek,
  timeLabel,
} from "./dates";
import type { CalEvent } from "./types";

// package.json runs tests with TZ=America/New_York.

function ev(partial: Partial<CalEvent>): CalEvent {
  return {
    id: partial.title ?? "e",
    people: ["a@x.com"],
    title: "Event",
    start: "",
    end: "",
    allDay: false,
    calendar: "Cal",
    ...partial,
  };
}

const plain = (s: string) => s.replace(/\s/g, " ");

describe("weeks and months", () => {
  it("starts weeks on Sunday", () => {
    // Wed Nov 11 2026
    expect(dayKey(startOfWeek(new Date(2026, 10, 11, 15)))).toBe("2026-11-08");
    expect(dayKey(startOfWeek(new Date(2026, 10, 8)))).toBe("2026-11-08");
  });

  it("starts the month grid on the Sunday before the 1st", () => {
    // Nov 1 2026 is a Sunday; Dec 1 2026 is a Tuesday.
    expect(dayKey(monthGridStart(new Date(2026, 10, 20)))).toBe("2026-11-01");
    expect(dayKey(monthGridStart(new Date(2026, 11, 20)))).toBe("2026-11-29");
  });
});

describe("eventDayKeys", () => {
  it("treats the all-day end date as exclusive", () => {
    expect(
      eventDayKeys(ev({ allDay: true, start: "2026-11-12", end: "2026-11-13" })),
    ).toEqual(["2026-11-12"]);
    expect(
      eventDayKeys(ev({ allDay: true, start: "2026-11-20", end: "2026-11-23" })),
    ).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
  });

  it("spreads overnight events across both days", () => {
    expect(
      eventDayKeys(
        ev({ start: "2026-11-13T22:00:00-05:00", end: "2026-11-14T02:00:00-05:00" }),
      ),
    ).toEqual(["2026-11-13", "2026-11-14"]);
  });

  it("does not count a day the event ends on at exactly midnight", () => {
    expect(
      eventDayKeys(
        ev({ start: "2026-11-13T20:00:00-05:00", end: "2026-11-14T00:00:00-05:00" }),
      ),
    ).toEqual(["2026-11-13"]);
  });

  it("uses local days for events written in another time zone", () => {
    // 2 AM UTC on the 14th is 9 PM on the 13th in New York.
    expect(
      eventDayKeys(ev({ start: "2026-11-14T02:00:00Z", end: "2026-11-14T03:00:00Z" })),
    ).toEqual(["2026-11-13"]);
  });

  it("keeps zero-length events on their day", () => {
    expect(
      eventDayKeys(
        ev({ start: "2026-11-13T09:00:00-05:00", end: "2026-11-13T09:00:00-05:00" }),
      ),
    ).toEqual(["2026-11-13"]);
  });
});

describe("groupByDay", () => {
  it("puts multi-day events on each day", () => {
    const trip = ev({ title: "Trip", allDay: true, start: "2026-11-20", end: "2026-11-22" });
    const lunch = ev({
      title: "Lunch",
      start: "2026-11-21T12:00:00-05:00",
      end: "2026-11-21T13:00:00-05:00",
    });
    const days = groupByDay([trip, lunch]);
    expect(days.get("2026-11-20")?.map((e) => e.title)).toEqual(["Trip"]);
    expect(days.get("2026-11-21")?.map((e) => e.title)).toEqual(["Trip", "Lunch"]);
  });
});

describe("timeLabel", () => {
  const overnight = ev({
    start: "2026-11-13T22:00:00-05:00",
    end: "2026-11-14T02:30:00-05:00",
  });

  it("shows a range for same-day events, dropping :00", () => {
    const e = ev({ start: "2026-11-13T09:30:00-05:00", end: "2026-11-13T11:00:00-05:00" });
    expect(plain(timeLabel(e, "2026-11-13", "en-US"))).toBe("9:30 AM – 11 AM");
  });

  it("splits overnight events into start and end", () => {
    expect(plain(timeLabel(overnight, "2026-11-13", "en-US"))).toBe("Starts 10 PM");
    expect(plain(timeLabel(overnight, "2026-11-14", "en-US"))).toBe("Until 2:30 AM");
  });

  it("calls middle days of long events all day", () => {
    const long = ev({ start: "2026-11-13T09:00:00-05:00", end: "2026-11-15T17:00:00-05:00" });
    expect(timeLabel(long, "2026-11-14", "en-US")).toBe("All day");
    expect(timeLabel(ev({ allDay: true, start: "2026-11-13", end: "2026-11-14" }), "2026-11-13")).toBe("All day");
  });
});
