import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MAX_GOOGLE_ACCOUNTS, MAX_ICLOUD_ACCOUNTS } from "@/lib/accounts";
import { discoverCalendars, ICLOUD_ERRORS, ICloudError, type ICloudCalendar } from "@/lib/caldav";
import { withGoogle } from "@/lib/calendar";
import { allowedEmails, DEMO } from "@/lib/config";
import { listCalendars, ReconnectNeeded, type GoogleCalendar } from "@/lib/google";
import { PALETTE } from "@/lib/palette";
import { getSessionEmail } from "@/lib/session";
import { getUser } from "@/lib/store";
import { FEED_ERRORS } from "@/lib/ics";
import { unseal } from "@/lib/secret";
import type { GoogleAccount, ICloudAccount, LinkedFeed, SavedCalendar, StoredUser } from "@/lib/types";
import {
  addFeed,
  addICloud,
  removeFeed,
  removeGoogleAccount,
  removeICloud,
  saveSettings,
} from "./actions";

const ACCOUNT_ERRORS: Record<string, string> = {
  denied: "Adding the account was cancelled.",
  expired: "That took too long or was interrupted. Try again.",
  no_calendar: "Leave the calendar box ticked when Google asks, so the app can see that account's calendars.",
  taken: "That Google account already belongs to someone else on this calendar.",
  too_many: `You can connect up to ${MAX_GOOGLE_ACCOUNTS} Google accounts. Remove one first.`,
};

type Choice = { id: string; name: string; primary?: boolean };
/** Calendars an account offers, or null if its sign-in needs renewing. */
type Offered = Choice[] | null;

async function offeredGoogle(user: StoredUser, account: GoogleAccount): Promise<Offered> {
  try {
    const list = await withGoogle(user, listCalendars, account);
    return list.map((c: GoogleCalendar) => ({
      id: c.id,
      name: c.summaryOverride ?? c.summary,
      primary: c.primary,
    }));
  } catch (e) {
    if (e instanceof ReconnectNeeded) return null;
    // Google is having trouble: show what was saved rather than break the page.
    console.error(`Couldn't list calendars for ${account.email}:`, e);
    return account.calendars;
  }
}

async function offeredICloud(account: ICloudAccount): Promise<Offered> {
  if (account.needsReconnect) return null;
  try {
    const list = await discoverCalendars({
      appleId: account.appleId,
      password: unseal(account.password),
    });
    return list.map((c: ICloudCalendar) => ({ id: c.url, name: c.name }));
  } catch (e) {
    if (!(e instanceof ICloudError)) throw e;
    // A wrong password needs the person; anything else, show what was saved.
    return e.code === "bad_login" ? null : account.calendars;
  }
}

function isPicked(saved: SavedCalendar[], c: Choice): boolean {
  return saved.some((s) => s.id === c.id || (s.id === "primary" && c.primary));
}

function CalendarChoices({
  title,
  field,
  offered,
  saved,
  reconnect,
}: {
  title: string;
  field: string;
  offered: Offered;
  saved: SavedCalendar[];
  reconnect: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-2 min-w-0 truncate font-semibold">{title}</legend>
      {offered === null ? (
        <p className="text-sm text-muted">
          This account&apos;s sign-in stopped working. {reconnect}
          {saved.map((c) => (
            <input key={c.id} type="hidden" name={field} value={c.id} />
          ))}
        </p>
      ) : (
        offered.map((c) => (
          <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name={field}
              value={c.id}
              defaultChecked={isPicked(saved, c)}
              className="size-5 accent-[var(--ink)]"
            />
            <span className="min-w-0 truncate">
              {c.name}
              {c.primary && <span className="text-muted"> (main)</span>}
            </span>
          </label>
        ))
      )}
    </fieldset>
  );
}

function Accounts({
  user,
  accountError,
  accountAdded,
  icloudError,
  icloudAdded,
}: {
  user: StoredUser;
  accountError?: string;
  accountAdded: boolean;
  icloudError?: string;
  icloudAdded: boolean;
}) {
  const extras = user.extraGoogle ?? [];
  const icloud = user.icloud ?? [];
  return (
    <section id="accounts" className="mt-12 flex scroll-mt-6 flex-col gap-4">
      <div>
        <h2 className="font-semibold">Your accounts</h2>
        <p className="mt-1 text-sm text-muted">
          Connect your other Google accounts (school, work) and iCloud, and all their calendars
          show up as yours. You can sign in with any of your Google accounts.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        <li className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{user.email}</span>
            <span className="block text-xs text-muted">Google · sign-in account</span>
          </span>
        </li>
        {extras.map((a) => (
          <li key={a.email} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{a.email}</span>
              <span className="block text-xs text-muted">
                Google{a.needsReconnect ? " · needs signing in again" : ""}
              </span>
            </span>
            <form action={removeGoogleAccount}>
              <input type="hidden" name="account_email" value={a.email} />
              <button type="submit" className="min-h-11 px-2 text-sm font-semibold underline underline-offset-2">
                Remove
              </button>
            </form>
          </li>
        ))}
        {icloud.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{a.appleId}</span>
              <span className="block text-xs text-muted">
                iCloud{a.needsReconnect ? " · password stopped working, add it again below" : ""}
              </span>
            </span>
            <form action={removeICloud}>
              <input type="hidden" name="icloud_id" value={a.id} />
              <button type="submit" className="min-h-11 px-2 text-sm font-semibold underline underline-offset-2">
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>

      {accountError && (
        <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          {accountError}
        </p>
      )}
      {accountAdded && !accountError && (
        <p role="status" className="text-sm">
          Google account connected. Pick its calendars above.
        </p>
      )}

      {extras.length + 1 < MAX_GOOGLE_ACCOUNTS && (
        <a
          href="/api/auth/login?link=1"
          className="inline-flex h-11 items-center self-start rounded-full border border-ink px-5 font-semibold"
        >
          Add another Google account
        </a>
      )}

      <form action={addICloud} className="mt-4 flex flex-col gap-3">
        <h3 className="font-semibold">Connect iCloud</h3>
        {icloudError && (
          <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            {icloudError}
          </p>
        )}
        {icloudAdded && !icloudError && (
          <p role="status" className="text-sm">
            iCloud connected. Its calendars are on your calendar now.
          </p>
        )}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Apple ID email</span>
          <input
            name="apple_id"
            type="email"
            autoCapitalize="off"
            autoComplete="username"
            required
            className="h-11 rounded-lg border border-line bg-surface px-3"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">App-specific password</span>
          <input
            name="apple_password"
            type="password"
            autoComplete="off"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            required
            className="h-11 rounded-lg border border-line bg-surface px-3"
          />
        </label>
        <button
          type="submit"
          disabled={icloud.length >= MAX_ICLOUD_ACCOUNTS}
          className="h-11 self-start rounded-full border border-ink px-5 font-semibold disabled:opacity-40"
        >
          Connect iCloud
        </button>
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-medium text-ink">How do I get an app-specific password?</summary>
          <p className="mt-3">
            Apple doesn&apos;t let apps use your normal password. Go to{" "}
            <a href="https://account.apple.com" className="underline underline-offset-2">account.apple.com</a>,
            sign in, open <strong>Sign-In and Security &gt; App-Specific Passwords</strong>, make one
            called &quot;Our Calendar&quot;, and paste it here. It only lets the app read your
            calendars, and you can revoke it there any time.
          </p>
        </details>
      </form>
    </section>
  );
}

function feedErrorMessage(code: string): string {
  if (code === "too_many") return "You've linked as many calendars as the app allows. Remove one first.";
  return FEED_ERRORS[code as keyof typeof FEED_ERRORS] ?? "That link couldn't be added.";
}

function LinkedCalendars({
  feeds,
  error,
  added,
}: {
  feeds: LinkedFeed[];
  error?: string;
  added: boolean;
}) {
  return (
    <section id="linked" className="mt-12 flex scroll-mt-6 flex-col gap-4">
      <div>
        <h2 className="font-semibold">Linked calendars</h2>
        <p className="mt-1 text-sm text-muted">
          Calendars that aren&apos;t in your Google account, like iCloud or school. The app
          checks them every few minutes.
        </p>
      </div>

      {feeds.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{f.name}</span>
                <span className="block truncate text-xs text-muted">{new URL(f.url).hostname}</span>
              </span>
              <form action={removeFeed}>
                <input type="hidden" name="feed_id" value={f.id} />
                <button
                  type="submit"
                  className="min-h-11 px-2 text-sm font-semibold underline underline-offset-2"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {added && !error && (
        <p role="status" className="text-sm">
          Linked. Its events are on your calendar now.
        </p>
      )}

      <form action={addFeed} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Name</span>
          <input
            name="feed_name"
            placeholder="iCloud, Barnard classes…"
            maxLength={40}
            className="h-11 rounded-lg border border-line bg-surface px-3"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Calendar link</span>
          <input
            name="feed_url"
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="webcal://… or https://…"
            className="h-11 rounded-lg border border-line bg-surface px-3"
          />
        </label>
        <button
          type="submit"
          className="h-11 self-start rounded-full border border-ink px-5 font-semibold"
        >
          Link calendar
        </button>
      </form>

      <details className="text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink">Where do I find the link?</summary>
        <dl className="mt-3 flex flex-col gap-3">
          <div>
            <dt className="font-semibold text-ink">iCloud</dt>
            <dd>
              On iPhone, open Calendar, tap Calendars, then the ⓘ next to the calendar. Turn on
              Public Calendar and tap Share Link, then Copy.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">CourseWorks classes</dt>
            <dd>In CourseWorks, open Calendar and click Calendar Feed at the bottom right. Copy the link.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">A school Google account</dt>
            <dd>
              In that account&apos;s Google Calendar, open the calendar&apos;s Settings and copy
              &quot;Secret address in iCal format&quot;. If it isn&apos;t there, the school has
              turned it off.
            </dd>
          </div>
        </dl>
        <p className="mt-3">Anyone with one of these links can see that calendar, so only paste it here.</p>
      </details>
    </section>
  );
}

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6 pb-16 sm:px-6">
      <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
        Back to calendar
      </Link>
      <Suspense fallback={<p className="mt-8 text-muted">Loading your calendars…</p>}>
        <Settings searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Settings({
  searchParams,
}: {
  searchParams: PageProps<"/settings">["searchParams"];
}) {
  const email = await getSessionEmail();
  if (!email) redirect("/");

  if (DEMO) {
    return (
      <>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Settings</h1>
        <p className="mt-4 text-muted">
          Settings are off in demo mode. Set up Google sign-in (see README.md) to pick your
          calendars and color.
        </p>
      </>
    );
  }

  const user = await getUser(email);
  if (!user) redirect("/");

  const extras = user.extraGoogle ?? [];
  const icloud = user.icloud ?? [];
  const [primaryOffered, extrasOffered, icloudOffered] = await Promise.all([
    offeredGoogle(user, user),
    Promise.all(extras.map((a) => offeredGoogle(user, a))),
    Promise.all(icloud.map((a) => offeredICloud(a))),
  ]);

  const {
    welcome,
    error,
    feed_error,
    feed_added,
    account_error,
    account_added,
    icloud_error,
    icloud_added,
  } = await searchParams;
  const partnerEmail = allowedEmails().find((e) => e !== email);
  const partner = partnerEmail ? await getUser(partnerEmail) : null;

  return (
    <>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">
        {welcome ? "You're in" : "Settings"}
      </h1>
      {welcome && (
        <p className="mt-3 text-muted">
          Pick your color and which of your calendars to show. You can change these any time.
        </p>
      )}

      <form action={saveSettings} className="mt-8 flex flex-col gap-8">
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Your name</span>
          <input
            name="name"
            defaultValue={user.name}
            maxLength={40}
            required
            className="h-11 rounded-lg border border-line bg-surface px-3"
          />
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-semibold">Your color</legend>
          <div className="grid grid-cols-4 gap-3">
            {PALETTE.map((c) => {
              const takenByPartner = partner?.color === c.value;
              return (
                <label
                  key={c.value}
                  className={`flex flex-col items-center gap-1.5 text-xs ${takenByPartner ? "opacity-40" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="color"
                    value={c.value}
                    defaultChecked={user.color === c.value}
                    disabled={takenByPartner}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="size-11 rounded-full ring-offset-2 ring-offset-bg peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink"
                    style={{ background: c.value }}
                  />
                  <span>{takenByPartner ? `${partner?.name}'s` : c.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-6">
          <h2 className="font-semibold">Calendars to show</h2>
          {error === "no_calendars" && (
            <p role="alert" className="-mt-4 text-sm">
              Pick at least one calendar.
            </p>
          )}
          <CalendarChoices
            title={`Google · ${user.email}`}
            field="calendar"
            offered={primaryOffered}
            saved={user.calendars}
            reconnect={
              <a href="/api/auth/login" className="font-semibold underline underline-offset-2">
                Sign in again
              </a>
            }
          />
          {extras.map((a, i) => (
            <CalendarChoices
              key={a.email}
              title={`Google · ${a.email}`}
              field={`calendar:${a.email}`}
              offered={extrasOffered[i]}
              saved={a.calendars}
              reconnect={
                <a href="/api/auth/login?link=1" className="font-semibold underline underline-offset-2">
                  Sign in to {a.email} again
                </a>
              }
            />
          ))}
          {icloud.map((a, i) => (
            <CalendarChoices
              key={a.id}
              title={`iCloud · ${a.appleId}`}
              field={`icloud:${a.id}`}
              offered={icloudOffered[i]}
              saved={a.calendars}
              reconnect={<>Connect it again below with a new app-specific password.</>}
            />
          ))}
        </div>

        <button
          type="submit"
          className="h-12 rounded-full bg-ink font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Save changes
        </button>
      </form>

      <Accounts
        user={user}
        accountError={typeof account_error === "string" ? ACCOUNT_ERRORS[account_error] : undefined}
        accountAdded={Boolean(account_added)}
        icloudError={
          typeof icloud_error === "string"
            ? (ICLOUD_ERRORS[icloud_error as keyof typeof ICLOUD_ERRORS] ?? "iCloud couldn't be connected.")
            : undefined
        }
        icloudAdded={Boolean(icloud_added)}
      />

      <LinkedCalendars
        feeds={user.feeds ?? []}
        error={typeof feed_error === "string" ? feedErrorMessage(feed_error) : undefined}
        added={Boolean(feed_added)}
      />

      <form action="/api/auth/logout" method="post" className="mt-10 border-t border-line pt-6">
        <p className="text-sm text-muted">Signed in as {email}</p>
        <button type="submit" className="mt-2 text-sm font-semibold underline underline-offset-2">
          Sign out
        </button>
      </form>
    </>
  );
}
