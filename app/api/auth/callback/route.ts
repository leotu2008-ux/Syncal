import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { MAX_GOOGLE_ACCOUNTS, ownerOfExtraGoogle } from "@/lib/accounts";
import { allowedEmails } from "@/lib/config";
import { exchangeCode, readIdToken } from "@/lib/google";
import { pickDefaultColor } from "@/lib/palette";
import { getSessionEmail, LINK_COOKIE, setSession, STATE_COOKIE } from "@/lib/session";
import { getUser, saveUser } from "@/lib/store";
import type { GoogleAccount } from "@/lib/types";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const home = (error?: string) =>
    NextResponse.redirect(new URL(error ? `/?error=${error}` : "/", url.origin));
  const settings = (query: string) =>
    NextResponse.redirect(new URL(`/settings?section=accounts&${query}`, url.origin));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const linking = cookieStore.get(LINK_COOKIE)?.value === "1";
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(LINK_COOKIE);

  if (url.searchParams.get("error")) return linking ? settings("account_error=denied") : home("denied");
  const code = url.searchParams.get("code");
  if (!code || !expectedState || url.searchParams.get("state") !== expectedState) {
    return linking ? settings("account_error=expired") : home("expired");
  }

  const redirectUri = new URL("/api/auth/callback", url.origin).toString();
  const tokens = await exchangeCode(code, redirectUri);
  if (!tokens.id_token) return home("expired");

  const claims = readIdToken(tokens.id_token);
  const email = claims.email?.toLowerCase();
  if (!email || !claims.email_verified) return home("not_allowed");
  if (!tokens.scope?.includes("calendar.readonly")) {
    return linking ? settings("account_error=no_calendar") : home("no_calendar");
  }

  const sessionEmail = await getSessionEmail();
  const isPrimary = allowedEmails().includes(email);

  // Adding another Google account to the signed-in person.
  if (linking && sessionEmail && !isPrimary) {
    const owner = await ownerOfExtraGoogle(email);
    if (owner && owner.email !== sessionEmail) return settings("account_error=taken");
    const user = await getUser(sessionEmail);
    if (!user) return home("expired");
    const extras = user.extraGoogle ?? [];
    const existing = extras.find((a) => a.email === email);
    if (!existing && extras.length + 1 >= MAX_GOOGLE_ACCOUNTS) {
      return settings("account_error=too_many");
    }
    const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
    if (!refreshToken) return settings("account_error=expired");
    const account: GoogleAccount = {
      email,
      refreshToken,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      // Start with that account's main calendar, named after the account.
      calendars: existing?.calendars ?? [{ id: "primary", name: email }],
      needsReconnect: false,
    };
    await saveUser({
      ...user,
      extraGoogle: existing
        ? extras.map((a) => (a.email === email ? account : a))
        : [...extras, account],
    });
    return settings("account_added=1");
  }
  if (linking && sessionEmail && isPrimary && email !== sessionEmail) {
    // That's the other person's sign-in account.
    return settings("account_error=taken");
  }

  // Signing in with an extra account signs in as the person it belongs to.
  if (!isPrimary) {
    const owner = await ownerOfExtraGoogle(email);
    if (!owner) return home("not_allowed");
    const extras = (owner.extraGoogle ?? []).map((a) =>
      a.email === email
        ? {
            ...a,
            refreshToken: tokens.refresh_token ?? a.refreshToken,
            accessToken: tokens.access_token,
            accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
            needsReconnect: false,
          }
        : a,
    );
    await saveUser({ ...owner, extraGoogle: extras });
    await setSession(owner.email);
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const existing = await getUser(email);
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) return home("expired");

  let color = existing?.color;
  if (!color) {
    const others = await Promise.all(
      allowedEmails()
        .filter((e) => e !== email)
        .map((e) => getUser(e)),
    );
    color = pickDefaultColor(others.flatMap((u) => (u ? [u.color] : [])));
  }

  await saveUser({
    ...existing,
    email,
    name: existing?.name ?? claims.given_name ?? claims.name ?? email.split("@")[0],
    color,
    refreshToken,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    // Start with their main calendar; they can add more in settings.
    calendars: existing?.calendars ?? [{ id: "primary", name: "Main" }],
    needsReconnect: false,
  });
  await setSession(email);

  return NextResponse.redirect(
    new URL(existing ? "/" : "/settings?section=profile&welcome=1", url.origin),
  );
}
