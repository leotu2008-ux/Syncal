import { describe, expect, it } from "vitest";
import { elements, parseCalendarList, text } from "./caldav";

const HOME = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
  <response>
    <href>/123/calendars/</href>
    <propstat><prop><resourcetype><collection/></resourcetype></prop></propstat>
  </response>
  <response>
    <href>/123/calendars/home/</href>
    <propstat><prop>
      <displayname>Home &amp; Family</displayname>
      <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
      <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set>
      <calendar-color xmlns="http://apple.com/ns/ical/">#FF2968FF</calendar-color>
    </prop></propstat>
  </response>
  <response>
    <href>/123/calendars/tasks/</href>
    <propstat><prop>
      <displayname>Reminders</displayname>
      <resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
      <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VTODO"/></supported-calendar-component-set>
    </prop></propstat>
  </response>
</multistatus>`;

describe("caldav", () => {
  it("lists only event calendars, with absolute URLs, names and colors", () => {
    expect(parseCalendarList(HOME, "https://p52-caldav.icloud.com:443/123/calendars/")).toEqual([
      { url: "https://p52-caldav.icloud.com/123/calendars/home/", name: "Home & Family", color: "#FF2968" },
    ]);
  });

  it("reads prefixed elements and CDATA calendar data", () => {
    const xml = `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
      <d:response><d:href>/a.ics</d:href><d:propstat><d:prop>
        <cal:calendar-data><![CDATA[BEGIN:VCALENDAR
END:VCALENDAR]]></cal:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`;
    expect(elements(xml, "response")).toHaveLength(1);
    expect(text(xml, "calendar-data")).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
    expect(text(xml, "href")).toBe("/a.ics");
  });

  it("decodes escaped calendar data", () => {
    const xml = `<calendar-data>BEGIN:VCALENDAR&#13;
SUMMARY:Tom &amp; Jerry&#13;
END:VCALENDAR</calendar-data>`;
    expect(text(xml, "calendar-data")).toContain("SUMMARY:Tom & Jerry");
  });
});

describe("iCloud sign-in and events (fake iCloud server)", () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc
DTSTART:20261116T150000Z
DTEND:20261116T160000Z
SUMMARY:Dentist
END:VEVENT
END:VCALENDAR`;

  it("discovers calendars and reads events, sending the Apple ID only to icloud.com", async () => {
    const { vi } = await import("vitest");
    const { discoverCalendars, fetchCalendarData } = await import("./caldav");
    const { parseFeed } = await import("./ics");
    const seen: string[] = [];
    const reply = (url: string, xml: string) =>
      Object.defineProperty(new Response(xml, { status: 207 }), "url", { value: url });
    vi.stubGlobal("fetch", async (input: URL, init: RequestInit) => {
      const url = input.toString();
      seen.push(`${init.method} ${url}`);
      expect((init.headers as Record<string, string>).authorization).toMatch(/^Basic /);
      if (url === "https://caldav.icloud.com/")
        return reply(url, `<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/123/principal/</href></current-user-principal></prop></propstat></response></multistatus>`);
      if (url.endsWith("/principal/"))
        return reply(url, `<multistatus xmlns="DAV:"><response><href>/123/principal/</href><propstat><prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">https://p52-caldav.icloud.com:443/123/calendars/</href></calendar-home-set></prop></propstat></response></multistatus>`);
      if (init.method === "PROPFIND") return reply(url, HOME);
      return reply(url, `<multistatus xmlns="DAV:"><response><href>/123/calendars/home/abc.ics</href><propstat><prop><calendar-data xmlns="urn:ietf:params:xml:ns:caldav">${ics.replace(/&/g, "&amp;")}</calendar-data></prop></propstat></response></multistatus>`);
    });
    const creds = { appleId: "a@icloud.com", password: "p" };
    const cals = await discoverCalendars(creds);
    expect(cals.map((c) => c.name)).toEqual(["Home & Family"]);
    const texts = await fetchCalendarData(creds, cals[0].url, new Date("2026-11-15"), new Date("2026-11-22"));
    const events = texts.flatMap((t) => parseFeed(t, "anna@gmail.com", "Home", new Date("2026-11-15"), new Date("2026-11-22")));
    expect(events.map((e) => e.title)).toEqual(["Dentist"]);
    expect(seen.every((s) => new URL(s.split(" ")[1]).hostname.endsWith("icloud.com"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("refuses to send credentials to a non-Apple host", async () => {
    const { fetchCalendarData, ICloudError } = await import("./caldav");
    await expect(
      fetchCalendarData({ appleId: "a", password: "p" }, "https://evil.example.com/cal/", new Date(), new Date()),
    ).rejects.toBeInstanceOf(ICloudError);
  });

  it("reports a wrong password as bad_login", async () => {
    const { vi } = await import("vitest");
    const { discoverCalendars } = await import("./caldav");
    vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
    await expect(discoverCalendars({ appleId: "a", password: "p" })).rejects.toMatchObject({ code: "bad_login" });
    vi.unstubAllGlobals();
  });
});
