import { allowedEmails, DEMO } from "./config";
import { DEMO_PEOPLE, demoEvents } from "./demo";
import { mergeEvents, normalizeEvent } from "./events";
import {
  listEvents,
  ReconnectNeeded,
  refreshAccessToken,
  Unauthorized,
} from "./google";
import { fetchCalendarData, ICloudError } from "./caldav";
import { fetchFeed, parseFeed } from "./ics";
import { unseal } from "./secret";
import { PALETTE } from "./palette";
import { getUser, saveUser } from "./store";
import type {
  CalEvent,
  EventsResponse,
  GoogleAccount,
  ICloudAccount,
  Person,
  StoredUser,
} from "./types";

/** Every Google account of a person's: the one they sign in with, then any extras. */
export function googleAccounts(user: StoredUser): GoogleAccount[] {
  return [user, ...(user.extraGoogle ?? [])];
}

async function freshAccessToken(
  user: StoredUser,
  account: GoogleAccount,
  force = false,
): Promise<string> {
  const valid =
    account.accessToken &&
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt > Date.now() + 60_000;
  if (valid && !force) return account.accessToken!;
  const token = await refreshAccessToken(account.refreshToken);
  account.accessToken = token.access_token;
  account.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;
  await saveUser(user);
  return token.access_token;
}

/**
 * Runs a Google call with a working access token, refreshing it if Google
 * rejects it. If the refresh token itself is dead, flags the person so the
 * app can ask them to sign in again.
 */
export async function withGoogle<T>(
  user: StoredUser,
  call: (accessToken: string) => Promise<T>,
  account: GoogleAccount = user,
): Promise<T> {
  try {
    try {
      return await call(await freshAccessToken(user, account));
    } catch (e) {
      if (!(e instanceof Unauthorized)) throw e;
      return await call(await freshAccessToken(user, account, true));
    }
  } catch (e) {
    if (e instanceof ReconnectNeeded || e instanceof Unauthorized) {
      account.needsReconnect = true;
      account.accessToken = undefined;
      await saveUser(user);
      throw new ReconnectNeeded(e.message);
    }
    throw e;
  }
}

function toPerson(email: string, user: StoredUser | null, index: number): Person {
  if (!user) {
    return {
      email,
      name: email.split("@")[0],
      color: PALETTE[index % PALETTE.length].value,
      connected: false,
      needsReconnect: false,
    };
  }
  return {
    email,
    name: user.name,
    color: user.color,
    connected: true,
    needsReconnect: Boolean(user.needsReconnect),
  };
}

async function eventsFor(
  user: StoredUser,
  account: GoogleAccount,
  timeMin: Date,
  timeMax: Date,
): Promise<CalEvent[]> {
  return withGoogle(user, async (token) => {
    const perCalendar = await Promise.all(
      account.calendars.map(async (cal) => {
        try {
          const items = await listEvents(
            token,
            cal.id,
            timeMin.toISOString(),
            timeMax.toISOString(),
          );
          return items
            .map((e) => normalizeEvent(e, user.email, cal.name))
            .filter((e): e is CalEvent => e !== null);
        } catch (e) {
          if (e instanceof Unauthorized) throw e;
          // A calendar that was deleted or unshared shouldn't hide the rest.
          console.error(`Skipping calendar ${cal.id} for ${account.email}:`, e);
          return [];
        }
      }),
    );
    return perCalendar.flat();
  }, account);
}

/** Events from someone's iCloud account. A wrong password flags the account; other errors skip it. */
async function icloudEventsFor(
  user: StoredUser,
  account: ICloudAccount,
  timeMin: Date,
  timeMax: Date,
): Promise<CalEvent[]> {
  const creds = { appleId: account.appleId, password: unseal(account.password) };
  const perCalendar = await Promise.all(
    account.calendars.map(async (cal) => {
      try {
        const texts = await fetchCalendarData(creds, cal.id, timeMin, timeMax);
        return texts.flatMap((t) => parseFeed(t, user.email, cal.name, timeMin, timeMax));
      } catch (e) {
        if (e instanceof ICloudError && e.code === "bad_login") throw e;
        console.error(`Skipping iCloud calendar ${cal.name} for ${account.appleId}:`, e);
        return [];
      }
    }),
  );
  return perCalendar.flat();
}

type Loaded = { events: CalEvent[]; broken: string[]; primaryBroken: boolean };

/** Everything one person has connected. A broken account is reported, not fatal. */
async function loadPerson(user: StoredUser, timeMin: Date, timeMax: Date): Promise<Loaded> {
  const broken: string[] = [];
  let primaryBroken = false;
  let changed = false;

  const google = googleAccounts(user).map(async (account) => {
    const isPrimary = account === user;
    if (account.needsReconnect) {
      if (isPrimary) primaryBroken = true;
      else broken.push(account.email);
      return [];
    }
    try {
      return await eventsFor(user, account, timeMin, timeMax);
    } catch (e) {
      if (!(e instanceof ReconnectNeeded)) {
        // Google trouble with one account shouldn't hide everyone else's events.
        console.error(`Skipping Google account ${account.email}:`, e);
        return [];
      }
      if (isPrimary) primaryBroken = true;
      else broken.push(account.email);
      return [];
    }
  });

  const icloud = (user.icloud ?? []).map(async (account) => {
    if (account.needsReconnect) {
      broken.push(`iCloud ${account.appleId}`);
      return [];
    }
    try {
      return await icloudEventsFor(user, account, timeMin, timeMax);
    } catch (e) {
      if (e instanceof ICloudError && e.code === "bad_login") {
        account.needsReconnect = true;
        changed = true;
      } else {
        console.error(`Skipping iCloud ${account.appleId}:`, e);
      }
      broken.push(`iCloud ${account.appleId}`);
      return [];
    }
  });

  // Linked calendars don't depend on any sign-in, so they always show.
  const lists = await Promise.all([...google, ...icloud, feedEventsFor(user, timeMin, timeMax)]);
  if (changed) await saveUser(user);
  return { events: lists.flat(), broken, primaryBroken };
}

/** Events from someone's linked calendars. A broken link is skipped, not fatal. */
async function feedEventsFor(
  user: StoredUser,
  timeMin: Date,
  timeMax: Date,
): Promise<CalEvent[]> {
  const perFeed = await Promise.all(
    (user.feeds ?? []).map(async (feed) => {
      try {
        const text = await fetchFeed(feed.url);
        return parseFeed(text, user.email, feed.name, timeMin, timeMax);
      } catch (e) {
        console.error(`Skipping linked calendar ${feed.id} for ${user.email}:`, e);
        return [];
      }
    }),
  );
  return perFeed.flat();
}

/** Both people and their merged events between two instants. */
export async function loadEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<EventsResponse> {
  if (DEMO) {
    const order = DEMO_PEOPLE.map((p) => p.email);
    return {
      people: DEMO_PEOPLE,
      events: mergeEvents(demoEvents(timeMin, timeMax), order),
    };
  }

  const emails = allowedEmails();
  const results = await Promise.all(
    emails.map(async (email, i) => {
      const user = await getUser(email);
      if (!user) return { person: toPerson(email, user, i), events: [] };
      const { events, broken, primaryBroken } = await loadPerson(user, timeMin, timeMax);
      const person = toPerson(email, user, i);
      return {
        person: {
          ...person,
          needsReconnect: primaryBroken,
          ...(broken.length ? { brokenAccounts: broken } : {}),
        },
        events,
      };
    }),
  );

  return {
    people: results.map((r) => r.person),
    events: mergeEvents(
      results.flatMap((r) => r.events),
      emails,
    ),
  };
}
