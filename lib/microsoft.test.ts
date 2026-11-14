import { describe, expect, it } from "vitest";
import { microsoftEmail, normalizeMicrosoftEvent } from "./microsoft";

describe("normalizeMicrosoftEvent", () => {
  it("reads UTC times from Graph", () => {
    const ev = normalizeMicrosoftEvent(
      {
        id: "1",
        iCalUId: "uid1",
        subject: " Lab ",
        start: { dateTime: "2026-11-16T15:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-11-16T16:30:00.0000000", timeZone: "UTC" },
        location: { displayName: "Room 4" },
        webLink: "https://outlook.live.com/x",
      },
      "anna@gmail.com",
      "Calendar",
    );
    expect(ev).toMatchObject({
      title: "Lab",
      start: "2026-11-16T15:00:00.000Z",
      end: "2026-11-16T16:30:00.000Z",
      allDay: false,
      location: "Room 4",
      people: ["anna@gmail.com"],
    });
  });

  it("keeps all-day events as dates", () => {
    const ev = normalizeMicrosoftEvent(
      {
        id: "2",
        isAllDay: true,
        start: { dateTime: "2026-11-20T00:00:00.0000000" },
        end: { dateTime: "2026-11-22T00:00:00.0000000" },
      },
      "a",
      "Cal",
    );
    expect(ev).toMatchObject({ start: "2026-11-20", end: "2026-11-22", allDay: true, title: "(No title)" });
  });

  it("drops cancelled and declined events", () => {
    const base = { id: "3", start: { dateTime: "2026-11-16T15:00:00" }, end: { dateTime: "2026-11-16T16:00:00" } };
    expect(normalizeMicrosoftEvent({ ...base, isCancelled: true }, "a", "c")).toBeNull();
    expect(normalizeMicrosoftEvent({ ...base, responseStatus: { response: "declined" } }, "a", "c")).toBeNull();
  });
});

describe("microsoftEmail", () => {
  const token = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
  it("uses email, falling back to preferred_username", () => {
    expect(microsoftEmail(token({ email: "Anna@Outlook.com" }))).toBe("anna@outlook.com");
    expect(microsoftEmail(token({ preferred_username: "anna@school.edu" }))).toBe("anna@school.edu");
    expect(microsoftEmail(token({ preferred_username: "not-an-email" }))).toBeNull();
  });
});
