"use client";

import { useEffect, useMemo, useRef } from "react";
import { dayKey, timeLabel } from "@/lib/dates";
import { layoutDay } from "@/lib/layout";
import type { CalEvent, Person } from "@/lib/types";
import { eventBar, eventFill, tint } from "./colors";

const HOUR_PX = 52;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
}

/** One day as an hour-by-hour timeline, like Google Calendar's day view. */
export default function DayView({
  day,
  today,
  nowMinutes,
  events,
  people,
  onOpenEvent,
}: {
  day: string;
  today: string;
  /** Minutes since local midnight, for the current-time line. */
  nowMinutes: number;
  events: CalEvent[];
  people: Map<string, Person>;
  onOpenEvent: (event: CalEvent) => void;
}) {
  const { allDay, blocks } = useMemo(() => layoutDay(events, day), [events, day]);
  const scroller = useRef<HTMLDivElement>(null);
  const isToday = day === today;

  // Start scrolled to just before now on today, or to the morning on other days.
  useEffect(() => {
    const now = new Date();
    const hour =
      dayKey(now) === day ? now.getHours() + now.getMinutes() / 60 - 1.5 : 7;
    // A little extra so the first hour's label isn't cut off at the top.
    scroller.current?.scrollTo({ top: Math.max(0, hour - 0.4) * HOUR_PX });
  }, [day]);

  const whoOf = (ev: CalEvent) => ev.people.flatMap((e) => people.get(e) ?? []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {allDay.length > 0 && (
        <ul className="flex flex-col gap-1 border-b border-line pb-2 pl-12" aria-label="All day">
          {allDay.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => onOpenEvent(ev)}
                className="w-full truncate rounded-md px-2 py-1 text-left text-sm font-semibold"
                style={{ background: eventFill(whoOf(ev)) }}
              >
                {ev.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative" style={{ height: 24 * HOUR_PX }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-0 left-0 flex"
              style={{ top: h * HOUR_PX }}
            >
              <span className="w-12 shrink-0 -translate-y-1/2 pr-2 text-right text-[11px] text-muted">
                {h > 0 && hourLabel(h)}
              </span>
              <span className="flex-1 border-t border-line" />
            </div>
          ))}

          <ol className="absolute inset-y-0 right-0 left-12" aria-label="Timed events">
            {blocks.map((b) => {
              const who = whoOf(b.event);
              const top = (b.startMin / 60) * HOUR_PX;
              const height = Math.max(((b.endMin - b.startMin) / 60) * HOUR_PX, 22) - 2;
              return (
                <li key={b.event.id}>
                  <button
                    type="button"
                    onClick={() => onOpenEvent(b.event)}
                    className="absolute flex flex-col justify-start overflow-hidden rounded-md py-0.5 pr-1.5 pl-2.5 text-left shadow-[0_0_0_1px_var(--bg)]"
                    style={{
                      top: top + 1,
                      height,
                      left: `${(b.col / b.cols) * 100}%`,
                      width: `calc(${100 / b.cols}% - 2px)`,
                      background: tint(who[0]?.color ?? "var(--muted)"),
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: eventBar(who) }}
                    />
                    <span className="block truncate text-xs font-semibold leading-4">
                      {b.event.title}
                    </span>
                    {height >= 34 && (
                      <span className="block truncate text-[11px] leading-4 text-muted">
                        {timeLabel(b.event, day)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {isToday && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-0 left-12 z-10 flex items-center"
              style={{ top: (nowMinutes / 60) * HOUR_PX }}
            >
              <span className="-ml-1.5 size-3 rounded-full bg-[#e5372f]" />
              <span className="h-0.5 flex-1 bg-[#e5372f]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
