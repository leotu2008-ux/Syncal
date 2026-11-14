import { describe, expect, it } from "vitest";
import { layoutDay } from "./layout";
import type { CalEvent } from "./types";

// package.json runs tests with TZ=America/New_York.

function timed(title: string, start: string, end: string): CalEvent {
  return {
    id: title,
    people: ["a@x.com"],
    title,
    start: `${start}-05:00`,
    end: `${end}-05:00`,
    allDay: false,
    calendar: "Cal",
  };
}

const DAY = "2026-11-13";
const at = (hhmm: string) => `${DAY}T${hhmm}:00`;

function place(events: CalEvent[]) {
  return Object.fromEntries(
    layoutDay(events, DAY).blocks.map((b) => [
      b.event.title,
      { start: b.startMin, end: b.endMin, col: b.col, cols: b.cols },
    ]),
  );
}

describe("layoutDay", () => {
  it("places events by local clock time", () => {
    expect(place([timed("Gym", at("07:00"), at("08:30"))])).toEqual({
      Gym: { start: 420, end: 510, col: 0, cols: 1 },
    });
  });

  it("puts overlapping events side by side", () => {
    const result = place([
      timed("Work", at("09:00"), at("17:00")),
      timed("Class", at("09:30"), at("10:45")),
    ]);
    expect(result.Work).toMatchObject({ col: 0, cols: 2 });
    expect(result.Class).toMatchObject({ col: 1, cols: 2 });
  });

  it("gives separate events the full width", () => {
    const result = place([
      timed("Gym", at("07:00"), at("08:00")),
      timed("Lunch", at("12:00"), at("13:00")),
    ]);
    expect(result.Gym.cols).toBe(1);
    expect(result.Lunch.cols).toBe(1);
  });

  it("reuses a column once it frees up", () => {
    // Work overlaps both meetings; the meetings don't overlap each other.
    const result = place([
      timed("Work", at("09:00"), at("17:00")),
      timed("Standup", at("09:30"), at("10:00")),
      timed("Review", at("14:00"), at("15:00")),
    ]);
    expect(result.Standup).toMatchObject({ col: 1, cols: 2 });
    expect(result.Review).toMatchObject({ col: 1, cols: 2 });
  });

  it("treats back-to-back events as not overlapping", () => {
    const result = place([
      timed("A", at("09:00"), at("10:00")),
      timed("B", at("10:00"), at("11:00")),
    ]);
    expect(result.A.cols).toBe(1);
    expect(result.B.cols).toBe(1);
  });

  it("cuts overnight events at midnight", () => {
    const party = timed("Party", "2026-11-12T22:00:00", at("02:00"));
    expect(place([party]).Party).toMatchObject({ start: 0, end: 120 });
    expect(
      layoutDay([party], "2026-11-12").blocks[0],
    ).toMatchObject({ startMin: 1320, endMin: 1440 });
  });

  it("moves timed events that cover the whole day to the all-day strip", () => {
    const conference = timed("Conference", "2026-11-12T09:00:00", "2026-11-14T17:00:00");
    const trip: CalEvent = { ...conference, id: "trip", title: "Trip", allDay: true, start: DAY, end: "2026-11-14" };
    const { allDay, blocks } = layoutDay([conference, trip], DAY);
    expect(allDay.map((e) => e.title)).toEqual(["Conference", "Trip"]);
    expect(blocks).toEqual([]);
  });
});
