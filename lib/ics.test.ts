import { describe, expect, it } from "vitest";
import { FeedError, normalizeFeedUrl, parseFeed } from "./ics";

const NY_TZ = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZNAME:EDT
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZNAME:EST
END:STANDARD
END:VTIMEZONE`;

function feed(...events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", NY_TZ, ...events, "END:VCALENDAR"]
    .join("\r\n");
}

const NOV = [new Date("2026-11-01T00:00:00-04:00"), new Date("2026-12-01T00:00:00-05:00")] as const;

describe("parseFeed", () => {
  it("expands a weekly series, skipping removed weeks and applying moved ones", () => {
    const text = feed(
      `BEGIN:VEVENT
UID:yoga@example.com
SUMMARY:Yoga
DTSTART;TZID=America/New_York:20261102T100000
DTEND;TZID=America/New_York:20261102T110000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/New_York:20261109T100000
END:VEVENT`,
      `BEGIN:VEVENT
UID:yoga@example.com
RECURRENCE-ID;TZID=America/New_York:20261116T100000
SUMMARY:Yoga (moved)
DTSTART;TZID=America/New_York:20261117T110000
DTEND;TZID=America/New_York:20261117T120000
END:VEVENT`,
    );
    const events = parseFeed(text, "a@x.com", "iCloud", ...NOV);
    expect(events.map((e) => [e.title, e.start])).toEqual([
      ["Yoga", "2026-11-02T15:00:00.000Z"],
      ["Yoga (moved)", "2026-11-17T16:00:00.000Z"],
      ["Yoga", "2026-11-23T15:00:00.000Z"],
      ["Yoga", "2026-11-30T15:00:00.000Z"],
    ]);
    expect(events[0]).toMatchObject({ people: ["a@x.com"], calendar: "iCloud", allDay: false });
  });

  it("treats an all-day event without an end as one day", () => {
    const text = feed(`BEGIN:VEVENT
UID:bday@example.com
SUMMARY:Birthday
DTSTART;VALUE=DATE:20261115
END:VEVENT`);
    expect(parseFeed(text, "a@x.com", "iCloud", ...NOV)).toMatchObject([
      { title: "Birthday", start: "2026-11-15", end: "2026-11-16", allDay: true },
    ]);
  });

  it("drops cancelled events and ones outside the range", () => {
    const text = feed(
      `BEGIN:VEVENT
UID:off@example.com
SUMMARY:Called off
STATUS:CANCELLED
DTSTART:20261110T150000Z
DTEND:20261110T160000Z
END:VEVENT`,
      `BEGIN:VEVENT
UID:old@example.com
SUMMARY:Last month
DTSTART:20261010T150000Z
DTEND:20261010T160000Z
END:VEVENT`,
    );
    expect(parseFeed(text, "a@x.com", "iCloud", ...NOV)).toEqual([]);
  });

  it("gives the same id as the Google copy of an event, so they merge", () => {
    const text = feed(`BEGIN:VEVENT
UID:dinner@example.com
SUMMARY:Dinner
DTSTART:20261120T230000Z
DTEND:20261121T010000Z
END:VEVENT`);
    const [ev] = parseFeed(text, "a@x.com", "iCloud", ...NOV);
    expect(ev.id).toBe(`dinner@example.com|${Date.parse("2026-11-20T23:00:00Z")}`);
  });

  it("rejects text that isn't a calendar", () => {
    expect(() => parseFeed("BEGIN:VCALENDAR\nnope", "a@x.com", "x", ...NOV)).toThrow(FeedError);
  });
});

describe("normalizeFeedUrl", () => {
  it("turns webcal links into https", () => {
    expect(normalizeFeedUrl(" webcal://p01-caldav.icloud.com/published/2/abc ")).toBe(
      "https://p01-caldav.icloud.com/published/2/abc",
    );
  });

  it.each(["http://example.com/cal.ics", "https://localhost/cal.ics", "https://10.0.0.1/x", "nope"])(
    "rejects %s",
    (url) => {
      expect(() => normalizeFeedUrl(url)).toThrow(FeedError);
    },
  );
});
