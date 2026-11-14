import { addDays, dayKey, startOfDay } from "./dates";
import type { CalEvent, Person } from "./types";

export const DEMO_PEOPLE: Person[] = [
  { email: "leo@example.com", name: "Leo", color: "#2f6fed", connected: true, needsReconnect: false },
  { email: "jamie@example.com", name: "Jamie", color: "#e0457b", connected: true, needsReconnect: false },
];

const [LEO, JAMIE] = DEMO_PEOPLE.map((p) => p.email);

type Template = {
  title: string;
  who: string[];
  /** 0 = Sunday */
  days: number[];
  from: [number, number];
  to: [number, number];
  location?: string;
};

const WEEKLY: Template[] = [
  { title: "Gym", who: [LEO], days: [2, 4], from: [7, 0], to: [8, 0] },
  { title: "Marketing class", who: [LEO], days: [1, 3], from: [9, 30], to: [10, 45], location: "Olin Hall 120" },
  { title: "Team sync", who: [LEO], days: [5], from: [14, 0], to: [15, 0] },
  { title: "Work", who: [JAMIE], days: [1, 2, 3, 4], from: [9, 0], to: [17, 0] },
  { title: "Yoga", who: [JAMIE], days: [2], from: [18, 30], to: [19, 30] },
  { title: "Dinner with Ana", who: [JAMIE], days: [5], from: [19, 30], to: [21, 30] },
  { title: "Date night", who: [LEO, JAMIE], days: [6], from: [19, 0], to: [22, 0], location: "Little Donkey" },
  { title: "Brunch", who: [LEO, JAMIE], days: [0], from: [11, 0], to: [12, 30] },
];

function at(day: Date, [h, m]: [number, number]): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString();
}

/** Made-up events between two instants, shaped like real merged ones. */
export function demoEvents(timeMin: Date, timeMax: Date): CalEvent[] {
  const events: CalEvent[] = [];
  for (let day = startOfDay(timeMin); day < timeMax; day = addDays(day, 1)) {
    for (const t of WEEKLY) {
      if (!t.days.includes(day.getDay())) continue;
      events.push({
        id: `${t.title}|${dayKey(day)}`,
        people: t.who,
        title: t.title,
        start: at(day, t.from),
        end: at(day, t.to),
        allDay: false,
        location: t.location,
        calendar: "Personal",
      });
    }
    if (day.getDate() === 15) {
      events.push({
        id: `bday|${dayKey(day)}`,
        people: [LEO],
        title: "Mom's birthday",
        start: dayKey(day),
        end: dayKey(addDays(day, 1)),
        allDay: true,
        calendar: "Family",
      });
    }
    if (day.getDate() === 20) {
      events.push({
        id: `trip|${dayKey(day)}`,
        people: [JAMIE],
        title: "Trip to Boston",
        start: dayKey(day),
        end: dayKey(addDays(day, 3)),
        allDay: true,
        calendar: "Personal",
      });
    }
  }
  return events;
}
