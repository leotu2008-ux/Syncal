import { describe, expect, it } from "vitest";
import { mergeEvents, normalizeEvent } from "./events";
import type { GoogleEvent } from "./google";

const A = "a@x.com";
const B = "b@x.com";

function g(partial: Partial<GoogleEvent>): GoogleEvent {
  return {
    id: "id1",
    iCalUID: "uid1@google.com",
    summary: "Dinner",
    start: { dateTime: "2026-11-14T19:00:00-05:00" },
    end: { dateTime: "2026-11-14T21:00:00-05:00" },
    ...partial,
  };
}

describe("normalizeEvent", () => {
  it("skips cancelled and declined events", () => {
    expect(normalizeEvent(g({ status: "cancelled" }), A, "Cal")).toBeNull();
    expect(
      normalizeEvent(
        g({ attendees: [{ self: true, responseStatus: "declined" }] }),
        A,
        "Cal",
      ),
    ).toBeNull();
    expect(
      normalizeEvent(
        g({ attendees: [{ self: false, responseStatus: "declined" }] }),
        A,
        "Cal",
      ),
    ).not.toBeNull();
  });

  it("reads all-day events and fills in a missing title", () => {
    const e = normalizeEvent(
      g({ summary: undefined, start: { date: "2026-11-20" }, end: { date: "2026-11-21" } }),
      A,
      "Cal",
    );
    expect(e).toMatchObject({ allDay: true, start: "2026-11-20", title: "(No title)" });
  });
});

describe("mergeEvents", () => {
  it("shows an event on both calendars once, with both people", () => {
    const mine = normalizeEvent(g({ id: "mine" }), B, "Mine")!;
    // Same event seen from A's calendar, written with a UTC start.
    const hers = normalizeEvent(
      g({
        id: "hers",
        start: { dateTime: "2026-11-15T00:00:00Z" },
        end: { dateTime: "2026-11-15T02:00:00Z" },
      }),
      A,
      "Hers",
    )!;
    const merged = mergeEvents([mine, hers], [A, B]);
    expect(merged).toHaveLength(1);
    expect(merged[0].people).toEqual([A, B]);
  });

  it("keeps separate occurrences of a repeating event apart", () => {
    const week1 = normalizeEvent(g({}), A, "Cal")!;
    const week2 = normalizeEvent(
      g({
        start: { dateTime: "2026-11-21T19:00:00-05:00" },
        end: { dateTime: "2026-11-21T21:00:00-05:00" },
      }),
      A,
      "Cal",
    )!;
    expect(mergeEvents([week2, week1], [A, B]).map((e) => e.start)).toEqual([
      week1.start,
      week2.start,
    ]);
  });

  it("puts all-day events first", () => {
    const allDay = normalizeEvent(
      g({ iCalUID: "trip", summary: "Trip", start: { date: "2026-11-14" }, end: { date: "2026-11-15" } }),
      B,
      "Cal",
    )!;
    const timed = normalizeEvent(g({}), A, "Cal")!;
    expect(mergeEvents([timed, allDay], [A, B]).map((e) => e.title)).toEqual(["Trip", "Dinner"]);
  });
});
