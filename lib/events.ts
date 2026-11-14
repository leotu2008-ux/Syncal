import type { GoogleEvent } from "./google";
import type { CalEvent } from "./types";

/** Milliseconds for an event start or end; all-day dates count from local midnight. */
export function eventInstant(value: string, allDay: boolean): number {
  if (!allDay) return new Date(value).getTime();
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Turns a Google event into ours, or null if it shouldn't be shown. */
export function normalizeEvent(
  e: GoogleEvent,
  email: string,
  calendarName: string,
): CalEvent | null {
  if (e.status === "cancelled") return null;
  if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) {
    return null;
  }
  const allDay = Boolean(e.start.date);
  const start = e.start.date ?? e.start.dateTime;
  const end = e.end.date ?? e.end.dateTime;
  if (!start || !end) return null;
  return {
    // Repeating events share an iCalUID, so the start tells occurrences apart.
    // The same event on both people's calendars gets the same id.
    id: `${e.iCalUID ?? e.id}|${eventInstant(start, allDay)}`,
    people: [email],
    title: e.summary?.trim() || "(No title)",
    start,
    end,
    allDay,
    location: e.location,
    calendar: calendarName,
    link: e.htmlLink,
  };
}

export function compareEvents(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (
    eventInstant(a.start, a.allDay) - eventInstant(b.start, b.allDay) ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Combines duplicates (one event on both calendars, or on two calendars of
 * one person) and sorts. `peopleOrder` sets the order of `people` on each event.
 */
export function mergeEvents(
  events: CalEvent[],
  peopleOrder: string[],
): CalEvent[] {
  const byId = new Map<string, CalEvent>();
  for (const ev of events) {
    const existing = byId.get(ev.id);
    if (!existing) {
      byId.set(ev.id, { ...ev, people: [...ev.people] });
      continue;
    }
    for (const p of ev.people) {
      if (!existing.people.includes(p)) existing.people.push(p);
    }
  }
  const rank = (email: string) => {
    const i = peopleOrder.indexOf(email);
    return i === -1 ? peopleOrder.length : i;
  };
  return [...byId.values()]
    .map((ev) => ({ ...ev, people: ev.people.sort((a, b) => rank(a) - rank(b)) }))
    .sort(compareEvents);
}
