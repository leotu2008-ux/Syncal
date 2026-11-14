import { requireEnv } from "./config";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/** Google no longer accepts the saved refresh token; the person must sign in again. */
export class ReconnectNeeded extends Error {}

/** The access token was rejected; refreshing it may fix this. */
export class Unauthorized extends Error {}

export function buildAuthUrl(redirectUri: string, state: string, chooseAccount = false): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google always returns a refresh token.
    // When adding another account, also show the account picker so a different one can be chosen.
    prompt: chooseAccount ? "select_account consent" : "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
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
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      ...body,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new ReconnectNeeded(json.error);
    throw new Error(
      `Google token request failed: ${json.error_description ?? json.error ?? res.status}`,
    );
  }
  return json;
}

export function exchangeCode(code: string, redirectUri: string) {
  return postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export function refreshAccessToken(refreshToken: string) {
  return postToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export type IdTokenClaims = {
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
};

/**
 * Reads the ID token's claims. Its signature isn't checked: it came straight
 * from Google's token endpoint over TLS, which Google documents as sufficient.
 */
export function readIdToken(idToken: string): IdTokenClaims {
  const payload = idToken.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString());
}

async function apiGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Unauthorized(`401 from ${path}`);
  if (!res.ok) {
    throw new Error(`Google Calendar API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function listAll<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await apiGet<{ items?: T[]; nextPageToken?: string }>(
      accessToken,
      path,
      pageToken ? { ...params, pageToken } : params,
    );
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

export type GoogleCalendar = {
  id: string;
  summary: string;
  summaryOverride?: string;
  primary?: boolean;
  backgroundColor?: string;
};

export function listCalendars(accessToken: string) {
  return listAll<GoogleCalendar>(accessToken, "/users/me/calendarList", {
    minAccessRole: "reader",
  });
}

export type GoogleEvent = {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

export function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
) {
  return listAll<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      timeMin,
      timeMax,
      // Expand repeating events into individual occurrences.
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    },
  );
}
