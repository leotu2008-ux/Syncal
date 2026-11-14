import type { CalEvent } from "./types";

/** Local calendar day as "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local midnight of a "YYYY-MM-DD" day. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Weeks start on Sunday. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -s.getDay());
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** First cell of a six-week month grid. */
export function monthGridStart(d: Date): Date {
  return startOfWeek(startOfMonth(d));
}

export function eventStart(ev: CalEvent): Date {
  return ev.allDay ? fromDayKey(ev.start) : new Date(ev.start);
}

export function eventEnd(ev: CalEvent): Date {
  return ev.allDay ? fromDayKey(ev.end) : new Date(ev.end);
}

/** Every local day an event touches. An end exactly at midnight doesn't count that day. */
export function eventDayKeys(ev: CalEvent): string[] {
  const first = startOfDay(eventStart(ev));
  let last = startOfDay(new Date(eventEnd(ev).getTime() - 1));
  if (last < first) last = first;
  const keys: string[] = [];
  for (let d = first; d <= last && keys.length < 366; d = addDays(d, 1)) {
    keys.push(dayKey(d));
  }
  return keys;
}

/** Events per local day. Keeps the input order within each day. */
export function groupByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const byDay = new Map<string, CalEvent[]>();
  for (const ev of events) {
    for (const key of eventDayKeys(ev)) {
      const list = byDay.get(key);
      if (list) list.push(ev);
      else byDay.set(key, [ev]);
    }
  }
  return byDay;
}

function formatTime(d: Date, locale?: string): string {
  return d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: d.getMinutes() === 0 ? undefined : "2-digit",
  });
}

/** How an event's time reads on a given day, e.g. "9:30 AM – 11 AM" or "Until 2 AM". */
export function timeLabel(ev: CalEvent, key: string, locale?: string): string {
  if (ev.allDay) return "All day";
  const start = eventStart(ev);
  const end = eventEnd(ev);
  const startsToday = dayKey(start) === key;
  const endsToday =
    end <= start || dayKey(new Date(end.getTime() - 1)) === key;
  if (startsToday && end <= start) return formatTime(start, locale);
  if (startsToday && endsToday) {
    return `${formatTime(start, locale)} – ${formatTime(end, locale)}`;
  }
  if (startsToday) return `Starts ${formatTime(start, locale)}`;
  if (endsToday) return `Until ${formatTime(end, locale)}`;
  return "All day";
}
