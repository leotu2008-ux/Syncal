import { requireEnv } from "./config";
import { eventInstant } from "./events";
import type { CalEvent } from "./types";

/**
 * Outlook / Microsoft 365 calendars through Microsoft Graph. Works for personal
 * accounts (outlook.com, hotmail.com, live.com) and work or school accounts.
 */

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = ["openid", "email", "profile", "offline_access", "Calendars.Read"];

/** Microsoft no longer accepts the saved sign-in; the person must connect again. */
export class MicrosoftReconnectNeeded extends Error {}
class MicrosoftUnauthorized extends Error {}

export function microsoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function buildMicrosoftAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("MICROSOFT_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES.join(" "),
    prompt: "select_account",
    state,
  });
  return `${AUTHORITY}/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("MICROSOFT_CLIENT_ID"),
      client_secret: requireEnv("MICROSOFT_CLIENT_SECRET"),
      scope: SCOPES.join(" "),
      ...body,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    if (json.error === "invalid_grant" || json.error === "interaction_required") {
      throw new MicrosoftReconnectNeeded(json.error);
    }
    throw new Error(
      `Microsoft token request failed: ${json.error_description ?? json.error ?? res.status}`,
    );
  }
  return json;
}

export function exchangeMicrosoftCode(code: string, redirectUri: string) {
  return postToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/** Microsoft hands out a new refresh token each time; save it. */
export function refreshMicrosoftToken(refreshToken: string) {
  return postToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** The account's email from the ID token (which came straight from Microsoft over TLS). */
export function microsoftEmail(idToken: string): string | null {
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()) as {
    email?: string;
    preferred_username?: string;
  };
  const email = claims.email ?? claims.preferred_username;
  return email && email.includes("@") ? email.toLowerCase() : null;
}

async function graphAll<T>(accessToken: string, firstUrl: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Times come back in UTC, so they can be read without timezone tables.
        prefer: 'outlook.timezone="UTC"',
      },
      cache: "no-store",
    });
    if (res.status === 401) throw new MicrosoftUnauthorized(`401 from Graph`);
    if (!res.ok) throw new Error(`Microsoft Graph request failed: ${res.status}`);
    const page = (await res.json()) as { value?: T[]; "@odata.nextLink"?: string };
    items.push(...(page.value ?? []));
    const next = page["@odata.nextLink"];
    url = next && next.startsWith(`${GRAPH}/`) ? next : undefined;
  }
  return items;
}

export type MicrosoftCalendar = { id: string; name: string; isDefaultCalendar?: boolean };

export function listMicrosoftCalendars(accessToken: string) {
  return graphAll<MicrosoftCalendar>(accessToken, `${GRAPH}/me/calendars?$top=100&$select=id,name,isDefaultCalendar`);
}

export type GraphEvent = {
  id: string;
  iCalUId?: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  webLink?: string;
  responseStatus?: { response?: string };
};

export function listMicrosoftEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
) {
  const params = new URLSearchParams({
    startDateTime: timeMin.toISOString(),
    endDateTime: timeMax.toISOString(),
    $top: "500",
    $select: "id,iCalUId,subject,isAllDay,isCancelled,start,end,location,webLink,responseStatus",
  });
  return graphAll<GraphEvent>(
    accessToken,
    `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`,
  );
}

/** Graph gives UTC times like "2026-11-16T15:00:00.0000000" with no zone marker. */
function utc(dateTime: string): string {
  return new Date(`${dateTime.replace(/\.\d+$/, "")}Z`).toISOString();
}

/** Turns an Outlook event into ours, or null if it shouldn't be shown. */
export function normalizeMicrosoftEvent(
  e: GraphEvent,
  email: string,
  calendarName: string,
): CalEvent | null {
  if (e.isCancelled) return null;
  if (e.responseStatus?.response === "declined") return null;
  if (!e.start?.dateTime || !e.end?.dateTime) return null;
  const allDay = Boolean(e.isAllDay);
  // All-day events are midnight-to-midnight; the date part is the day itself.
  const start = allDay ? e.start.dateTime.slice(0, 10) : utc(e.start.dateTime);
  const end = allDay ? e.end.dateTime.slice(0, 10) : utc(e.end.dateTime);
  return {
    id: `${e.iCalUId ?? e.id}|${eventInstant(start, allDay)}`,
    people: [email],
    title: e.subject?.trim() || "(No title)",
    start,
    end,
    allDay,
    location: e.location?.displayName?.trim() || undefined,
    calendar: calendarName,
    link: e.webLink?.startsWith("https://") ? e.webLink : undefined,
  };
}

export { MicrosoftUnauthorized };
