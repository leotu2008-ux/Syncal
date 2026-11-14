import type { Person } from "@/lib/types";

/** A person's color softened toward the page surface, for event backgrounds. */
export function tint(color: string, percent = 22): string {
  return `color-mix(in srgb, ${color} ${percent}%, var(--surface))`;
}

const colorOf = (p: Person | undefined) => p?.color ?? "var(--muted)";

/** Event background. Shared events are split into both people's colors. */
export function eventFill(people: Person[]): string {
  if (people.length < 2) return tint(colorOf(people[0]));
  return `linear-gradient(to right, ${tint(people[0].color)} 50%, ${tint(people[1].color)} 50%)`;
}

/** The solid accent bar on an event; split top and bottom for shared events. */
export function eventBar(people: Person[]): string {
  if (people.length < 2) return colorOf(people[0]);
  return `linear-gradient(to bottom, ${people[0].color} 50%, ${people[1].color} 50%)`;
}
