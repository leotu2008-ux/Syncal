import { Suspense } from "react";
import CalendarView from "@/components/CalendarView";
import { DEMO } from "@/lib/config";
import { getSessionEmail } from "@/lib/session";

const ERRORS: Record<string, string> = {
  not_allowed:
    "That Google account isn't on the list for this calendar. Sign in with the account it was set up for, then add your other accounts in Settings.",
  denied: "Sign-in was cancelled. Try again when you're ready.",
  expired: "Sign-in took too long or was interrupted. Try again.",
  no_calendar:
    "The app needs permission to see your calendars. Sign in again and leave the calendar box ticked.",
};

export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Home searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Home({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const email = await getSessionEmail();
  if (email) return <CalendarView demo={DEMO} />;
  const { error } = await searchParams;
  return <SignIn error={typeof error === "string" ? ERRORS[error] : undefined} />;
}

function SignIn({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight">
        Our Calendar
      </h1>
      <p className="mt-4 text-lg text-muted">
        Both of your Google Calendars in one place, each in your own color.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-8 rounded-lg border border-line bg-surface px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}
      <a
        href="/api/auth/login"
        className="mt-8 inline-flex h-12 items-center justify-center gap-3 rounded-full bg-ink px-6 font-semibold text-bg transition-opacity hover:opacity-90"
      >
        <GoogleMark />
        Sign in with Google
      </a>
      <p className="mt-4 text-sm text-muted">
        Read-only. The app can see your calendars but never changes them.{" "}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy
        </a>
      </p>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
