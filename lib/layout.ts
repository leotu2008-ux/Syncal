import { addDays, eventEnd, eventStart, fromDayKey } from "./dates";
import type { CalEvent } from "./types";

/** A timed event placed on a day's timeline. Minutes are local clock minutes (0–1440). */
export type Block = {
  event: CalEvent;
  startMin: number;
  endMin: number;
  /** Side-by-side position among overlapping events. */
  col: number;
  cols: number;
};

/** Shortest an event is treated as when deciding overlaps, so tiny events stay readable. */
const MIN_SPAN = 20;

function clockMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Splits a day's events into the all-day strip and timeline blocks.
 * Timed events that cover the whole day go in the all-day strip; events that
 * cross midnight are cut to this day. Overlapping events share the width,
 * like Google Calendar.
 */
export function layoutDay(
  events: CalEvent[],
  key: string,
): { allDay: CalEvent[]; blocks: Block[] } {
  const dayStart = fromDayKey(key);
  const dayEnd = addDays(dayStart, 1);
  const allDay: CalEvent[] = [];
  const timed: Omit<Block, "col" | "cols">[] = [];

  for (const event of events) {
    if (event.allDay) {
      allDay.push(event);
      continue;
    }
    const start = eventStart(event);
    const end = eventEnd(event);
    const startsBefore = start <= dayStart;
    const endsAfter = end >= dayEnd;
    if (startsBefore && endsAfter) {
      allDay.push(event);
      continue;
    }
    const startMin = startsBefore ? 0 : clockMinutes(start);
    const endMin = endsAfter ? 1440 : Math.max(clockMinutes(end), startMin);
    timed.push({ event, startMin, endMin });
  }

  timed.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const blocks: Block[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];
  const closeCluster = () => {
    for (const b of cluster) b.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };

  for (const t of timed) {
    const visualEnd = Math.max(t.endMin, t.startMin + MIN_SPAN);
    if (t.startMin >= clusterEnd) closeCluster();
    let col = colEnds.findIndex((end) => end <= t.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(visualEnd);
    } else {
      colEnds[col] = visualEnd;
    }
    const block = { ...t, col, cols: 1 };
    cluster.push(block);
    blocks.push(block);
    clusterEnd = Math.max(clusterEnd, visualEnd);
  }
  closeCluster();

  return { allDay, blocks };
}
