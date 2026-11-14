"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { MAX_ICLOUD_ACCOUNTS } from "@/lib/accounts";
import { discoverCalendars, ICloudError, type ICloudErrorCode } from "@/lib/caldav";
import { withGoogle, withMicrosoft } from "@/lib/calendar";
import { DEMO } from "@/lib/config";
import { listCalendars, ReconnectNeeded } from "@/lib/google";
import {
  FeedError,
  fetchFeed,
  normalizeFeedUrl,
  parseFeed,
  type FeedErrorCode,
} from "@/lib/ics";
import { isPaletteColor } from "@/lib/palette";
import { listMicrosoftCalendars, MicrosoftReconnectNeeded } from "@/lib/microsoft";
import { seal, unseal } from "@/lib/secret";
import { getSessionEmail } from "@/lib/session";
import { getUser, saveUser } from "@/lib/store";
import type {
  GoogleAccount,
  ICloudAccount,
  MicrosoftAccount,
  SavedCalendar,
  StoredUser,
} from "@/lib/types";

async function currentUser(): Promise<StoredUser> {
  const email = await getSessionEmail();
  if (!email || DEMO) redirect("/");
  const user = await getUser(email);
  if (!user) redirect("/");
  return user;
}

/** The ticked calendars of one Google account, checked against what Google says exists. */
async function pickGoogle(
  user: StoredUser,
  account: GoogleAccount,
  ids: string[],
): Promise<SavedCalendar[]> {
  try {
    const available = await withGoogle(user, listCalendars, account);
    return available
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary }));
  } catch (e) {
    // Can't check right now: keep what was saved so nothing is lost.
    if (e instanceof ReconnectNeeded) return account.calendars;
    throw e;
  }
}

async function pickMicrosoft(
  user: StoredUser,
  account: MicrosoftAccount,
  ids: string[],
): Promise<SavedCalendar[]> {
  try {
    const available = await withMicrosoft(user, account, listMicrosoftCalendars);
    return available.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, name: c.name }));
  } catch (e) {
    if (e instanceof MicrosoftReconnectNeeded) return account.calendars;
    throw e;
  }
}

async function pickICloud(account: ICloudAccount, ids: string[]): Promise<SavedCalendar[]> {
  try {
    const available = await discoverCalendars({
      appleId: account.appleId,
      password: unseal(account.password),
    });
    return available.filter((c) => ids.includes(c.url)).map((c) => ({ id: c.url, name: c.name }));
  } catch (e) {
    if (e instanceof ICloudError) return account.calendars;
    throw e;
  }
}

export async function saveSettings(formData: FormData) {
  const user = await currentUser();
  const ids = (field: string) => formData.getAll(field).map(String);

  const calendars = await pickGoogle(user, user, ids("calendar"));
  const extraGoogle = await Promise.all(
    (user.extraGoogle ?? []).map(async (a) => ({
      ...a,
      calendars: await pickGoogle(user, a, ids(`calendar:${a.email}`)),
    })),
  );
  const icloud = await Promise.all(
    (user.icloud ?? []).map(async (a) => ({
      ...a,
      calendars: await pickICloud(a, ids(`icloud:${a.id}`)),
    })),
  );

  const microsoft = await Promise.all(
    (user.microsoft ?? []).map(async (a) => ({
      ...a,
      calendars: await pickMicrosoft(user, a, ids(`ms:${a.email}`)),
    })),
  );

  const total =
    calendars.length +
    microsoft.reduce((n, a) => n + a.calendars.length, 0) +
    extraGoogle.reduce((n, a) => n + a.calendars.length, 0) +
    icloud.reduce((n, a) => n + a.calendars.length, 0) +
    (user.feeds?.length ?? 0);
  if (total === 0) redirect("/settings?error=no_calendars");

  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  const color = String(formData.get("color") ?? "");

  await saveUser({
    ...user,
    name: name || user.name,
    color: isPaletteColor(color) ? color : user.color,
    calendars,
    extraGoogle,
    icloud,
    microsoft,
  });
  redirect("/");
}

export async function removeGoogleAccount(formData: FormData) {
  const user = await currentUser();
  const email = String(formData.get("account_email") ?? "");
  await saveUser({
    ...user,
    extraGoogle: (user.extraGoogle ?? []).filter((a) => a.email !== email),
  });
  redirect("/settings#accounts");
}

export async function removeMicrosoft(formData: FormData) {
  const user = await currentUser();
  const email = String(formData.get("ms_email") ?? "");
  await saveUser({ ...user, microsoft: (user.microsoft ?? []).filter((a) => a.email !== email) });
  redirect("/settings#accounts");
}

/** Signs in to iCloud and adds the account with all its calendars ticked. */
export async function addICloud(formData: FormData) {
  const user = await currentUser();
  const appleId = String(formData.get("apple_id") ?? "").trim().toLowerCase();
  // Apple shows app-specific passwords as xxxx-xxxx-xxxx-xxxx; people often paste spaces.
  const password = String(formData.get("apple_password") ?? "").replace(/\s+/g, "");
  const accounts = user.icloud ?? [];
  const existing = accounts.find((a) => a.appleId === appleId);

  let error: ICloudErrorCode | null = null;
  let found: { url: string; name: string }[] = [];
  if (!appleId || !password) error = "missing";
  else if (!existing && accounts.length >= MAX_ICLOUD_ACCOUNTS) error = "too_many";
  else {
    try {
      found = await discoverCalendars({ appleId, password });
      if (found.length === 0) error = "no_calendars";
    } catch (e) {
      if (!(e instanceof ICloudError)) throw e;
      error = e.code;
    }
  }
  // redirect() works by throwing, so it stays outside the try.
  if (error) redirect(`/settings?icloud_error=${error}#accounts`);

  const account: ICloudAccount = {
    id: existing?.id ?? `i_${randomBytes(6).toString("hex")}`,
    appleId,
    password: seal(password),
    // Reconnecting keeps their picks; a new account starts with everything shown.
    calendars: existing?.calendars.length
      ? existing.calendars.filter((c) => found.some((f) => f.url === c.id))
      : found.map((c) => ({ id: c.url, name: c.name })),
    needsReconnect: false,
  };
  await saveUser({
    ...user,
    icloud: existing
      ? accounts.map((a) => (a.id === existing.id ? account : a))
      : [...accounts, account],
  });
  redirect("/settings?icloud_added=1#accounts");
}

export async function removeICloud(formData: FormData) {
  const user = await currentUser();
  const id = String(formData.get("icloud_id") ?? "");
  await saveUser({ ...user, icloud: (user.icloud ?? []).filter((a) => a.id !== id) });
  redirect("/settings#accounts");
}

const MAX_FEEDS = 6;

/** Adds a calendar link after checking it really is a calendar the server can read. */
export async function addFeed(formData: FormData) {
  const email = await getSessionEmail();
  if (!email || DEMO) redirect("/");
  const user = await getUser(email);
  if (!user) redirect("/");
  const feeds = user.feeds ?? [];
  if (feeds.length >= MAX_FEEDS) redirect("/settings?feed_error=too_many#linked");

  const name =
    String(formData.get("feed_name") ?? "").trim().slice(0, 40) || "Linked calendar";
  let url: string;
  let error: FeedErrorCode | null = null;
  try {
    url = normalizeFeedUrl(String(formData.get("feed_url") ?? ""));
    const now = new Date();
    parseFeed(await fetchFeed(url, true), email, name, now, now);
  } catch (e) {
    if (!(e instanceof FeedError)) throw e;
    error = e.code;
    url = "";
  }
  // redirect() works by throwing, so it stays outside the try.
  if (error) redirect(`/settings?feed_error=${error}#linked`);

  await saveUser({
    ...user,
    feeds: [...feeds, { id: `f_${randomBytes(6).toString("hex")}`, name, url }],
  });
  redirect("/settings?feed_added=1#linked");
}

export async function removeFeed(formData: FormData) {
  const email = await getSessionEmail();
  if (!email || DEMO) redirect("/");
  const user = await getUser(email);
  if (!user) redirect("/");
  const id = String(formData.get("feed_id") ?? "");
  await saveUser({ ...user, feeds: (user.feeds ?? []).filter((f) => f.id !== id) });
  redirect("/settings#linked");
}
