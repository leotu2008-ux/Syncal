/** One of the two people whose calendars are shown. */
export type Person = {
  email: string;
  name: string;
  color: string;
  /** Has signed in with Google at least once. */
  connected: boolean;
  /** Google rejected their saved access; they need to sign in again. */
  needsReconnect: boolean;
};

/**
 * A calendar event, already merged across people. When both people are on
 * the same event (same Google event, same start), `people` holds both emails.
 *
 * All-day events use "YYYY-MM-DD" dates with an exclusive end, exactly as
 * Google returns them. Timed events use ISO date-times with offsets.
 */
export type CalEvent = {
  id: string;
  people: string[];
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  calendar: string;
  link?: string;
};

export type EventsResponse = {
  people: Person[];
  events: CalEvent[];
};

export type SavedCalendar = { id: string; name: string };

/** A calendar read from a pasted link (iCloud, CourseWorks, a school Google account). */
export type LinkedFeed = { id: string; name: string; url: string };

/** What the server keeps for each person. Never sent to the browser. */
export type StoredUser = {
  email: string;
  name: string;
  color: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  calendars: SavedCalendar[];
  feeds?: LinkedFeed[];
  needsReconnect?: boolean;
};
