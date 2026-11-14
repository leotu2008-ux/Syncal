import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { MAX_MICROSOFT_ACCOUNTS } from "@/lib/accounts";
import { allowedEmails } from "@/lib/config";
import { exchangeMicrosoftCode, listMicrosoftCalendars, microsoftEmail } from "@/lib/microsoft";
import { getSessionEmail, MS_STATE_COOKIE } from "@/lib/session";
import { getUser, saveUser } from "@/lib/store";
import type { MicrosoftAccount } from "@/lib/types";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/settings?${query}#accounts`, url.origin));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(MS_STATE_COOKIE)?.value;
  cookieStore.delete(MS_STATE_COOKIE);

  const sessionEmail = await getSessionEmail();
  if (!sessionEmail) return NextResponse.redirect(new URL("/", url.origin));
  if (url.searchParams.get("error")) return settings("ms_error=denied");
  const code = url.searchParams.get("code");
  if (!code || !expectedState || url.searchParams.get("state") !== expectedState) {
    return settings("ms_error=expired");
  }

  const redirectUri = new URL("/api/auth/microsoft/callback", url.origin).toString();
  const tokens = await exchangeMicrosoftCode(code, redirectUri);
  const email = tokens.id_token ? microsoftEmail(tokens.id_token) : null;
  if (!email || !tokens.refresh_token) return settings("ms_error=expired");
  if (!tokens.scope?.toLowerCase().includes("calendars.read")) {
    return settings("ms_error=no_calendar");
  }

  // The same Outlook account can't belong to both people.
  for (const other of allowedEmails().filter((e) => e !== sessionEmail)) {
    const u = await getUser(other);
    if (u?.microsoft?.some((a) => a.email === email)) return settings("ms_error=taken");
  }

  const user = await getUser(sessionEmail);
  if (!user) return NextResponse.redirect(new URL("/", url.origin));
  const accounts = user.microsoft ?? [];
  const existing = accounts.find((a) => a.email === email);
  if (!existing && accounts.length >= MAX_MICROSOFT_ACCOUNTS) {
    return settings("ms_error=too_many");
  }

  const account: MicrosoftAccount = {
    email,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    calendars: existing?.calendars ?? [],
    needsReconnect: false,
  };
  if (!existing) {
    // Start with their main Outlook calendar.
    try {
      const cals = await listMicrosoftCalendars(tokens.access_token);
      const main = cals.find((c) => c.isDefaultCalendar) ?? cals[0];
      if (main) account.calendars = [{ id: main.id, name: main.name }];
    } catch (e) {
      console.error(`Couldn't list Outlook calendars for ${email}:`, e);
    }
  }

  await saveUser({
    ...user,
    microsoft: existing
      ? accounts.map((a) => (a.email === email ? account : a))
      : [...accounts, account],
  });
  return settings("ms_added=1");
}
