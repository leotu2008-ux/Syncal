"use client";

import { useEffect, useMemo, useRef } from "react";
import { addDays, dayKey } from "@/lib/dates";
import { layoutDay } from "@/lib/layout";
import type { CalEvent, Person } from "@/lib/types";
import { eventBar, eventFill, tint } from "./colors";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MAX_ALL_DAY = 2;

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Seven days side by side on an hour-by-hour timeline. Tap a day's header to open it. */
export default function WeekView({
  hourPx: HOUR_PX = 48,
  dayCount = 7,
  weekStart,
  today,
  nowMinutes,
  byDay,
  people,
  onOpenDay,
  onOpenEvent,
}: {
  /** Height of one hour on the timeline, in pixels. */
  hourPx?: number;
  /** How many days to show side by side (3, 5 or 7). */
  dayCount?: number;
  weekStart: Date;
  today: string;
  /** Minutes since local midnight, for the current-time line. */
  nowMinutes: number;
  byDay: Map<string, CalEvent[]>;
  people: Map<string, Person>;
  onOpenDay: (day: string) => void;
  onOpenEvent: (event: CalEvent, day: string) => void;
}) {
  const days = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, i) => {
        const date = addDays(weekStart, i);
        const key = dayKey(date);
        return { date, key, ...layoutDay(byDay.get(key) ?? [], key) };
      }),
    [weekStart, byDay, dayCount],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const weekKey = dayKey(weekStart);
  const hasToday = days.some((d) => d.key === today);

  // Start scrolled to just before now if this week has today, otherwise to the morning.
  useEffect(() => {
    const now = new Date();
    const hour = hasToday ? now.getHours() + now.getMinutes() / 60 - 1.5 : 7;
    scroller.current?.scrollTo({ top: Math.max(0, hour - 0.4) * HOUR_PX });
  }, [weekKey, hasToday, HOUR_PX]);

  const whoOf = (ev: CalEvent) => ev.people.flatMap((e) => people.get(e) ?? []);
  const anyAllDay = days.some((d) => d.allDay.length > 0);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface"
      style={{ "--days": dayCount } as React.CSSProperties}
    >
      <div className="grid grid-cols-[2.5rem_repeat(var(--days),minmax(0,1fr))] border-b border-line">
        <span />
        {days.map(({ date, key }) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpenDay(key)}
            aria-label={`Open ${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
            className="flex flex-col items-center py-1.5 hover:bg-bg"
          >
            <span className="text-[11px] font-medium text-muted">
              {date.toLocaleDateString(undefined, { weekday: dayCount <= 5 ? "short" : "narrow" })}
            </span>
            <span
              className={`grid size-7 place-items-center rounded-full text-sm font-semibold tabular-nums ${
                key === today ? "bg-today text-on-today" : ""
              }`}
            >
              {date.getDate()}
            </span>
          </button>
        ))}
      </div>

      {anyAllDay && (
        <div className="grid grid-cols-[2.5rem_repeat(var(--days),minmax(0,1fr))] border-b border-line py-1">
          <span className="self-center pr-1 text-right text-[10px] text-muted">all-day</span>
          {days.map(({ key, allDay }) => (
            <ul key={key} className="flex min-w-0 flex-col gap-0.5 px-0.5" aria-label="All day">
              {allDay.slice(0, MAX_ALL_DAY).map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => onOpenEvent(ev, key)}
                    className="block w-full truncate rounded px-1 text-left text-[10px] font-semibold leading-4 sm:text-xs sm:leading-5"
                    style={{ background: eventFill(whoOf(ev)) }}
                  >
                    {ev.title}
                  </button>
                </li>
              ))}
              {allDay.length > MAX_ALL_DAY && (
                <li>
                  <button
                    type="button"
                    onClick={() => onOpenDay(key)}
                    className="block w-full truncate px-1 text-left text-[10px] text-muted"
                  >
                    +{allDay.length - MAX_ALL_DAY} more
                  </button>
                </li>
              )}
            </ul>
          ))}
        </div>
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className="relative grid grid-cols-[2.5rem_repeat(var(--days),minmax(0,1fr))]"
          style={{ height: 24 * HOUR_PX }}
        >
          <div className="relative">
            {HOURS.map((h) =>
              h > 0 ? (
                <span
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted"
                  style={{ top: h * HOUR_PX }}
                >
                  {hourLabel(h)}
                </span>
              ) : null,
            )}
          </div>

          {days.map(({ key, blocks }) => (
            <div key={key} className="relative border-l border-line">
              {HOURS.map((h) => (
                <span
                  key={h}
                  aria-hidden="true"
                  className="absolute right-0 left-0 border-t border-line"
                  style={{ top: h * HOUR_PX }}
                />
              ))}
              <ol aria-label="Timed events">
                {blocks.map((b) => {
                  const who = whoOf(b.event);
                  const top = (b.startMin / 60) * HOUR_PX;
                  const height = Math.max(((b.endMin - b.startMin) / 60) * HOUR_PX, 18) - 2;
                  return (
                    <li key={b.event.id}>
                      <button
                        type="button"
                        onClick={() => onOpenEvent(b.event, key)}
                        title={b.event.title}
                        className="absolute flex flex-col justify-start overflow-hidden rounded py-0.5 pr-0.5 pl-1.5 text-left shadow-[0_0_0_1px_var(--bg)]"
                        style={{
                          top: top + 1,
                          height,
                          // Columns are narrow, so overlapping events stack with an
                          // offset instead of splitting the width; titles stay readable.
                          left: `${(b.col / b.cols) * 50}%`,
                          width: `calc(${100 - (b.col / b.cols) * 50}% - 1px)`,
                          zIndex: b.col + 1,
                          background: tint(who[0]?.color ?? "var(--muted)"),
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-0.5"
                          style={{ background: eventBar(who) }}
                        />
                        <span className="line-clamp-3 block text-[10px] font-semibold leading-3 [overflow-wrap:anywhere] sm:text-xs sm:leading-4">
                          {b.event.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {key === today && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
                  style={{ top: (nowMinutes / 60) * HOUR_PX }}
                >
                  <span className="-ml-1 size-2 rounded-full bg-[#e5372f]" />
                  <span className="h-0.5 flex-1 bg-[#e5372f]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
