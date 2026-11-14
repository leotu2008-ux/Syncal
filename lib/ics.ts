import ICAL from "ical.js";
import { eventInstant } from "./events";
import type { CalEvent } from "./types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5_000_000;
const CACHE_MS = 5 * 60_000;
// Stops a runaway repeat rule (say, every minute forever) from hanging a request.
const MAX_OCCURRENCES = 50_000;

export const FEED_ERRORS = {
  not_link: "That doesn't look like a link.",
  not_https: "The link has to start with https:// or webcal://.",
  blocked: "That link points somewhere the app can't reach.",
  unreachable: "Couldn't reach that link. Check it and try again.",
  gone: "That link doesn't work anymore, or the calendar isn't shared publicly.",
  server: "The calendar's server answered with an error. Try again later.",
  too_big: "That calendar is too big to load.",
  not_calendar: "That link isn't a calendar feed.",
  unreadable: "That calendar couldn't be read.",
} as const;

export type FeedErrorCode = keyof typeof FEED_ERRORS;

export class FeedError extends Error {
  constructor(readonly code: FeedErrorCode) {
    super(FEED_ERRORS[code]);
  }
}

/**
 * Accepts what people paste from Apple Calendar, Google or CourseWorks and
 * returns an https URL, or throws a FeedError saying what's wrong.
 */
export function normalizeFeedUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new FeedError("not_link");
  }
  if (url.protocol !== "https:") {
    throw new FeedError("not_https");
  }
  const host = url.hostname.toLowerCase();
  // The server fetches these links, so keep it off local and private addresses.
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  ) {
    throw new FeedError("blocked");
  }
  return url.toString();
}

const cache = new Map<string, { at: number; text: string }>();

/** Downloads a calendar feed, reusing a copy fetched in the last few minutes. */
export async function fetchFeed(url: string, fresh = false): Promise<string> {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.text;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "text/calendar, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new FeedError("unreachable");
  }
  if (!res.ok) {
    throw new FeedError(res.status === 404 || res.status === 403 ? "gone" : "server");
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FeedError("too_big");
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new FeedError("not_calendar");
  }
  cache.set(url, { at: Date.now(), text });
  return text;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toValue(t: ICAL.Time): string {
  if (t.isDate) return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  return t.toJSDate().toISOString();
}

/**
 * Events from an iCalendar feed that overlap [timeMin, timeMax), with
 * repeating events expanded and moved or cancelled occurrences applied.
 */
export function parseFeed(
  text: string,
  email: string,
  calendarName: string,
  timeMin: Date,
  timeMax: Date,
): CalEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new FeedError("unreadable");
  }
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(tz);
  }

  // Group by UID so moved or cancelled occurrences attach to their series.
  const series = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
  const loose: ICAL.Component[] = [];
  for (const comp of root.getAllSubcomponents("vevent")) {
    const uid = comp.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid) {
      loose.push(comp);
      continue;
    }
    const entry = series.get(uid) ?? { exceptions: [] };
    if (comp.hasProperty("recurrence-id")) entry.exceptions.push(comp);
    else entry.master = comp;
    series.set(uid, entry);
  }

  const minMs = timeMin.getTime();
  const maxMs = timeMax.getTime();
  const out: CalEvent[] = [];

  const push = (
    source: ICAL.Event,
    uid: string,
    start: ICAL.Time,
    end: ICAL.Time,
  ) => {
    if (String(source.component.getFirstPropertyValue("status")).toUpperCase() === "CANCELLED") {
      return;
    }
    const allDay = start.isDate;
    const startValue = toValue(start);
    // A missing or zero-length all-day end means a single day.
    let endValue = toValue(end);
    if (allDay && endValue <= startValue) {
      const next = start.clone();
      next.adjust(1, 0, 0, 0);
      endValue = toValue(next);
    }
    const startMs = eventInstant(startValue, allDay);
    const endMs = eventInstant(endValue, allDay);
    if (endMs <= minMs || startMs >= maxMs) return;
    const url = source.component.getFirstPropertyValue("url");
    out.push({
      id: `${uid}|${startMs}`,
      people: [email],
      title: source.summary?.trim() || "(No title)",
      start: startValue,
      end: endValue,
      allDay,
      location: source.location?.trim() || undefined,
      calendar: calendarName,
      link: typeof url === "string" && url.startsWith("https://") ? url : undefined,
    });
  };

  for (const [uid, { master, exceptions }] of series) {
    if (!master) {
      // Moved occurrences whose series isn't in the feed: show them as they are.
      for (const ex of exceptions) {
        const ev = new ICAL.Event(ex);
        push(ev, uid, ev.startDate, ev.endDate);
      }
      continue;
    }
    const event = new ICAL.Event(master);
    for (const ex of exceptions) event.relateException(ex);
    if (!event.isRecurring()) {
      push(event, uid, event.startDate, event.endDate);
      continue;
    }
    const it = event.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      const d = event.getOccurrenceDetails(next);
      if (eventInstant(toValue(d.startDate), d.startDate.isDate) >= maxMs) break;
      push(d.item, uid, d.startDate, d.endDate);
    }
  }

  for (const comp of loose) {
    const ev = new ICAL.Event(comp);
    push(ev, `${calendarName}-${out.length}`, ev.startDate, ev.endDate);
  }
  return out;
}
