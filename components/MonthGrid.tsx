import { addDays, dayKey } from "@/lib/dates";
import type { CalEvent, Person } from "@/lib/types";
import { eventFill } from "./colors";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_SHOWN = 3;

export default function MonthGrid({
  gridStart,
  month,
  today,
  byDay,
  people,
  onOpenDay,
}: {
  gridStart: Date;
  month: number;
  today: string;
  byDay: Map<string, CalEvent[]>;
  people: Map<string, Person>;
  onOpenDay: (day: string) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
        {WEEKDAYS.map((d, i) => (
          <abbr key={i} title={WEEKDAY_NAMES[i]} className="py-1.5 no-underline">
            {d}
          </abbr>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((date) => {
          const key = dayKey(date);
          const events = byDay.get(key) ?? [];
          const inMonth = date.getMonth() === month;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenDay(key)}
              aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, ${events.length} ${events.length === 1 ? "event" : "events"}`}
              className={`flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-line p-0.5 text-left hover:bg-bg sm:p-1 [&:not(:nth-child(7n))]:border-r [&:nth-child(n+8)]:border-t ${
                inMonth ? "" : "bg-bg/50"
              }`}
            >
              <span
                className={`mx-auto grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  isToday ? "bg-today text-on-today" : inMonth ? "" : "text-muted"
                }`}
              >
                {date.getDate()}
              </span>
              {events.slice(0, MAX_SHOWN).map((ev) => (
                <span
                  key={ev.id}
                  className={`block shrink-0 truncate rounded px-1 text-[10px] font-medium leading-4 sm:text-xs sm:leading-5 ${
                    inMonth ? "" : "opacity-60"
                  }`}
                  style={{ background: eventFill(ev.people.flatMap((e) => people.get(e) ?? [])) }}
                >
                  {ev.title}
                </span>
              ))}
              {events.length > MAX_SHOWN && (
                <span className="px-1 text-[10px] leading-3 text-muted sm:text-xs">
                  {events.length - MAX_SHOWN} more
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
