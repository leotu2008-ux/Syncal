"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addDays,
  addMonths,
  dayKey,
  fromDayKey,
  groupByDay,
  monthGridStart,
  startOfMonth,
} from "@/lib/dates";
import type { CalEvent, EventsResponse, Person } from "@/lib/types";
import DayView from "./DayView";
import EventSheet from "./EventSheet";
import MonthGrid from "./MonthGrid";

const REFRESH_MS = 2 * 60 * 1000;
const DAY_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/** The current minute (ms / 60000), ticking while the page is open. Null during server render. */
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
function useMinute(): number | null {
  return useSyncExternalStore(subscribeClock, currentMinute, () => null);
}

const monthOf = (key: string) => dayKey(startOfMonth(fromDayKey(key)));

export default function CalendarView({ demo }: { demo: boolean }) {
  const minute = useMinute();
  if (minute === null) return <div className="min-h-dvh" />;
  return <Calendar minute={minute} demo={demo} />;
}

function Calendar({ minute, demo }: { minute: number; demo: boolean }) {
  const now = new Date(minute * 60_000);
  const today = dayKey(now);

  // The open day lives in the URL (?day=YYYY-MM-DD) so the back button returns to the month.
  const dayParam = useSearchParams().get("day");
  const openDay = dayParam && DAY_PARAM.test(dayParam) ? dayParam : null;
  const cameFromMonth = useRef(false);

  const [month, setMonth] = useState(() => monthOf(openDay ?? today));
  const [hidden, setHidden] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ event: CalEvent; day: string } | null>(null);

  // `range` records which range the data is for, so a range change shows as loading.
  const [data, setData] = useState<(EventsResponse & { range: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);

  const shownMonth = openDay ? monthOf(openDay) : month;
  const gridStart = monthGridStart(fromDayKey(shownMonth));
  const range = dayKey(gridStart);
  const loading = data?.range !== range;

  useEffect(() => {
    const controller = new AbortController();
    const start = fromDayKey(range);
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: addDays(start, 42).toISOString(),
    });

    async function load() {
      try {
        const res = await fetch(`/api/events?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setData({ ...(await res.json()), range });
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("Couldn't reach Google Calendar. It will try again in a couple of minutes.");
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [range, retries]);

  const people = useMemo(
    () => new Map((data?.people ?? []).map((p) => [p.email, p])),
    [data],
  );
  const byDay = useMemo(() => {
    const visible = (data?.events ?? []).filter((ev) =>
      ev.people.some((p) => !hidden.includes(p)),
    );
    return groupByDay(visible);
  }, [data, hidden]);

  const openDayView = (key: string) => {
    cameFromMonth.current = true;
    window.history.pushState(null, "", `?day=${key}`);
  };
  const moveDay = (key: string) => window.history.replaceState(null, "", `?day=${key}`);
  const backToMonth = () => {
    if (openDay) setMonth(monthOf(openDay));
    if (cameFromMonth.current) {
      cameFromMonth.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  const toggle = (email: string) =>
    setHidden((h) => (h.includes(email) ? h.filter((e) => e !== email) : [...h, email]));

  const notice = (data?.people ?? []).find(
    (p) => !p.connected || p.needsReconnect || p.brokenAccounts?.length,
  );
  const openDate = openDay ? fromDayKey(openDay) : null;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-3 pt-4 pb-3 sm:px-6 sm:pt-6">
      <header className="flex items-center justify-between gap-3">
        {openDate ? (
          <button
            type="button"
            onClick={backToMonth}
            className="-ml-2 flex h-10 items-center gap-1 rounded-full pr-3 pl-1 font-semibold text-muted hover:bg-surface hover:text-ink"
          >
            <Chevron dir="left" />
            {openDate.toLocaleDateString(undefined, { month: "long" })}
          </button>
        ) : (
          <h1 className="font-display text-3xl font-bold leading-none tracking-tight">
            <People people={data?.people ?? []} hidden={hidden} onToggle={toggle} />
          </h1>
        )}
        <Link
          href="/settings"
          aria-label="Settings"
          className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
        >
          <GearIcon />
        </Link>
      </header>

      {demo && (
        <p className="mt-2 text-xs text-muted">
          Demo mode: made-up events. Turn off DEMO_MODE to use your real calendars.
        </p>
      )}
      {notice && <ConnectNotice person={notice} />}

      <nav className="mt-3 mb-2 flex items-center gap-1">
        {openDate ? (
          <h2 className="mr-auto flex items-baseline gap-2" aria-live="polite">
            <span
              className={`font-display text-3xl font-bold leading-none tabular-nums ${
                openDay === today ? "rounded-lg bg-today px-1.5 py-0.5 text-on-today" : ""
              }`}
            >
              {openDate.getDate()}
            </span>
            <span className="font-display text-lg font-semibold">
              {openDate.toLocaleDateString(undefined, { weekday: "long" })}
            </span>
          </h2>
        ) : (
          <h2 className="mr-auto font-display text-xl font-semibold" aria-live="polite">
            {fromDayKey(shownMonth).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h2>
        )}
        <IconButton
          label={openDay ? "Previous day" : "Previous month"}
          onClick={() =>
            openDay
              ? moveDay(dayKey(addDays(fromDayKey(openDay), -1)))
              : setMonth(dayKey(addMonths(fromDayKey(month), -1)))
          }
        >
          <Chevron dir="left" />
        </IconButton>
        <IconButton
          label={openDay ? "Next day" : "Next month"}
          onClick={() =>
            openDay
              ? moveDay(dayKey(addDays(fromDayKey(openDay), 1)))
              : setMonth(dayKey(addMonths(fromDayKey(month), 1)))
          }
        >
          <Chevron dir="right" />
        </IconButton>
        <button
          type="button"
          onClick={() => (openDay ? moveDay(today) : setMonth(monthOf(today)))}
          className="ml-1 h-9 rounded-full border border-line bg-surface px-3.5 text-sm font-medium"
        >
          Today
        </button>
      </nav>

      {error && (
        <p role="alert" className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          {error}
          <button type="button" onClick={() => setRetries((n) => n + 1)} className="shrink-0 font-semibold underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      <div
        className={`flex min-h-0 flex-1 flex-col transition-opacity ${
          loading && !data ? "opacity-0" : loading ? "opacity-60" : ""
        }`}
      >
        {openDay ? (
          <DayView
            key={openDay}
            day={openDay}
            today={today}
            nowMinutes={now.getHours() * 60 + now.getMinutes()}
            events={byDay.get(openDay) ?? []}
            people={people}
            onOpenEvent={(event) => setSheet({ event, day: openDay })}
          />
        ) : (
          <MonthGrid
            gridStart={gridStart}
            month={fromDayKey(shownMonth).getMonth()}
            today={today}
            byDay={byDay}
            people={people}
            onOpenDay={openDayView}
          />
        )}
      </div>

      {sheet && (
        <EventSheet
          key={sheet.event.id}
          event={sheet.event}
          day={sheet.day}
          people={people}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}

/** "Leo & Jamie": each name in its color, tap to hide or show their events. */
function People({
  people,
  hidden,
  onToggle,
}: {
  people: Person[];
  hidden: string[];
  onToggle: (email: string) => void;
}) {
  if (people.length === 0) return <>Our Calendar</>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      {people.map((p, i) => {
        const off = hidden.includes(p.email);
        return (
          <span key={p.email} className="flex items-baseline gap-x-2">
            {i > 0 && <span className="text-muted">&amp;</span>}
            <button
              type="button"
              onClick={() => onToggle(p.email)}
              aria-pressed={!off}
              title={off ? `Show ${p.name}'s events` : `Hide ${p.name}'s events`}
              className={`rounded decoration-[0.08em] ${off ? "line-through opacity-40" : ""}`}
              style={{ color: p.color }}
            >
              {p.name}
            </button>
          </span>
        );
      })}
    </span>
  );
}

function ConnectNotice({ person }: { person: Person }) {
  return (
    <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      {person.needsReconnect ? (
        <>
          <strong>{person.name}</strong> needs to sign in again before their events show up.
          Google stopped accepting the old sign-in.
        </>
      ) : person.connected && person.brokenAccounts?.length ? (
        <>
          <strong>{person.name}</strong>&apos;s {person.brokenAccounts.join(", ")}{" "}
          {person.brokenAccounts.length > 1 ? "need" : "needs"} reconnecting in Settings before
          those events show up.
        </>
      ) : (
        <>
          <strong>{person.email}</strong> hasn&apos;t signed in yet. Send them this page&apos;s
          link so their calendar shows up too.
        </>
      )}
    </p>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
