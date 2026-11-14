import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy – Our Calendar" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12 leading-relaxed">
      <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
        Back to Our Calendar
      </Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-6">
        Our Calendar is a private app for two people to see each other&apos;s Google
        Calendars in one place. Only the two Google accounts it was set up for can sign in.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">What it reads</h2>
      <p className="mt-2">
        When you sign in with Google, the app asks for your name, email address, and
        read-only access to your calendars. It never creates, changes, or deletes events.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">What it keeps</h2>
      <p className="mt-2">
        To stay signed in, the app stores your name, chosen color, which calendars to
        show, and the access token Google issues. Calendar events are fetched from Google
        each time the page loads and are not stored. Nothing is sold or shared, and the
        data is only shown to the two people using the app.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Removing access</h2>
      <p className="mt-2">
        You can cut off the app at any time from{" "}
        <a
          href="https://myaccount.google.com/permissions"
          className="underline underline-offset-2"
        >
          your Google Account permissions
        </a>
        . For questions, use the support email shown on Google&apos;s sign-in screen.
      </p>

      <p className="mt-8 text-sm text-muted">
        Use of information received from Google APIs follows the Google API Services User
        Data Policy, including the Limited Use requirements.
      </p>
    </main>
  );
}
