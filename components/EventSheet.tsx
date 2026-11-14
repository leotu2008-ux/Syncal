"use client";

import { useEffect, useRef } from "react";
import { eventDayKeys, fromDayKey, timeLabel } from "@/lib/dates";
import type { CalEvent, Person } from "@/lib/types";
import { eventBar } from "./colors";

/** Date line and time line for the event as seen from `day`. */
function whenLines(event: CalEvent, day: string): [string, string] {
  const days = eventDayKeys(event);
  if (event.allDay && days.length > 1) {
    const fmt = { month: "short", day: "numeric" } as const;
    const first = fromDayKey(days[0]).toLocaleDateString(undefined, fmt);
    const last = fromDayKey(days[days.length - 1]).toLocaleDateString(undefined, fmt);
    return [`${first} – ${last}`, "All day"];
  }
  const date = fromDayKey(day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return [date, timeLabel(event, day)];
}

/** Details for one event, as a bottom sheet on phones and a centered card on wider screens. */
export default function EventSheet({
  event,
  day,
  people,
  onClose,
}: {
  event: CalEvent;
  day: string;
  people: Map<string, Person>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const who = event.people.flatMap((e) => people.get(e) ?? []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the dimmed backdrop land on the dialog itself.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      aria-labelledby="event-title"
      className="mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-2xl bg-surface p-0 text-ink backdrop:bg-black/40 sm:mb-auto sm:rounded-2xl"
    >
      <div className="flex flex-col gap-4 p-5 pb-10 sm:pb-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-6 w-1.5 shrink-0 rounded-full"
            style={{ background: eventBar(who) }}
          />
          <h2 id="event-title" className="min-w-0 flex-1 font-display text-2xl font-bold leading-tight">
            {event.title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-bg hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted">When</dt>
          <dd>
            {whenLines(event, day).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </dd>
          {event.location && (
            <>
              <dt className="text-muted">Where</dt>
              <dd>{event.location}</dd>
            </>
          )}
          <dt className="text-muted">Who</dt>
          <dd>{who.map((p) => p.name).join(" and ")}</dd>
          <dt className="text-muted">Calendar</dt>
          <dd>{event.calendar}</dd>
        </dl>
        {event.link && (
          <a
            href={event.link}
            target="_blank"
            rel="noreferrer"
            className="self-start text-sm font-semibold underline underline-offset-2"
          >
            Open in Google Calendar
          </a>
        )}
      </div>
    </dialog>
  );
}
