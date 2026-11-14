/** One of the two people whose calendars are shown. */
export type Person = {
  email: string;
  name: string;
  color: string;
  /** Has signed in with Google at least once. */
  connected: boolean;
  /** Google rejected their saved access; they need to sign in again. */
  needsReconnect: boolean;
  /** Extra Google or iCloud accounts of theirs that need signing in again. */
  brokenAccounts?: string[];
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

/** A Google account's saved sign-in and the calendars picked from it. */
export type GoogleAccount = {
  email: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  calendars: SavedCalendar[];
  needsReconnect?: boolean;
};

/** An iCloud account read over CalDAV. `password` is an encrypted app-specific password. */
export type ICloudAccount = {
  id: string;
  appleId: string;
  password: string;
  /** Calendar ids here are the calendars' CalDAV URLs. */
  calendars: SavedCalendar[];
  needsReconnect?: boolean;
};

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
  /** More Google accounts of this person's, beyond the one they sign in with. */
  extraGoogle?: GoogleAccount[];
  icloud?: ICloudAccount[];
  microsoft?: MicrosoftAccount[];
};

/** An Outlook / Microsoft 365 account read through Microsoft Graph. */
export type MicrosoftAccount = {
  email: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  calendars: SavedCalendar[];
  needsReconnect?: boolean;
};
