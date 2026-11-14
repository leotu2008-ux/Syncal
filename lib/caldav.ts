/**
 * A small CalDAV client for iCloud. Apple has no OAuth for calendars, so this
 * signs in with the Apple ID and an app-specific password (appleid.apple.com >
 * Sign-In and Security > App-Specific Passwords).
 */

const ROOT = "https://caldav.icloud.com/";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 10_000_000;

export const ICLOUD_ERRORS = {
  bad_login:
    "Apple didn't accept that Apple ID and password. Use an app-specific password, not your normal one.",
  unreachable: "Couldn't reach iCloud. Try again in a minute.",
  server: "iCloud answered with an error. Try again later.",
  no_calendars: "That iCloud account has no calendars to show.",
  missing: "Enter your Apple ID email and an app-specific password.",
  too_many: "You've connected as many iCloud accounts as the app allows. Remove one first.",
  duplicate: "That iCloud account is already connected.",
} as const;

export type ICloudErrorCode = keyof typeof ICLOUD_ERRORS;

export class ICloudError extends Error {
  constructor(readonly code: ICloudErrorCode) {
    super(ICLOUD_ERRORS[code]);
  }
}

export type ICloudCredentials = { appleId: string; password: string };
export type ICloudCalendar = { url: string; name: string; color?: string };

function authHeader({ appleId, password }: ICloudCredentials): string {
  return `Basic ${Buffer.from(`${appleId}:${password}`).toString("base64")}`;
}

/** Only ever send the Apple ID to Apple's own CalDAV servers. */
function checkHost(url: URL): void {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "icloud.com" || host.endsWith(".icloud.com"))) {
    throw new ICloudError("server");
  }
}

async function dav(
  creds: ICloudCredentials,
  method: "PROPFIND" | "REPORT",
  url: string,
  depth: "0" | "1",
  body: string,
): Promise<{ xml: string; url: string }> {
  const target = new URL(url);
  checkHost(target);
  let res: Response;
  try {
    res = await fetch(target, {
      method,
      headers: {
        authorization: authHeader(creds),
        depth,
        "content-type": "application/xml; charset=utf-8",
      },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ICloudError("unreachable");
  }
  if (res.status === 401 || res.status === 403) throw new ICloudError("bad_login");
  if (!res.ok && res.status !== 207) throw new ICloudError("server");
  checkHost(new URL(res.url || target));
  const xml = await res.text();
  if (xml.length > MAX_BYTES) throw new ICloudError("server");
  return { xml, url: res.url || target.toString() };
}

// ---- just enough XML reading for WebDAV multistatus replies ----

function decodeXml(text: string): string {
  const cdata = text.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  if (cdata) return cdata[1];
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Raw inner XML of every element with this local name (any namespace prefix). */
export function elements(xml: string, name: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}\\s*>)`,
    "g",
  );
  return [...xml.matchAll(re)].map((m) => m[1] ?? "");
}

export function text(xml: string, name: string): string | undefined {
  const el = elements(xml, name)[0];
  return el === undefined ? undefined : decodeXml(el).trim();
}

const PROPFIND = (props: string) =>
  `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:x="http://apple.com/ns/ical/"><d:prop>${props}</d:prop></d:propfind>`;

/** Parses the calendar-home listing into the calendars that hold events. */
export function parseCalendarList(xml: string, base: string): ICloudCalendar[] {
  const out: ICloudCalendar[] = [];
  for (const response of elements(xml, "response")) {
    const href = text(response, "href");
    const types = elements(response, "resourcetype")[0] ?? "";
    if (!href || !/<(?:[\w.-]+:)?calendar[\s/>]/.test(types)) continue;
    const comps = elements(response, "supported-calendar-component-set")[0];
    if (comps && !/name="VEVENT"/i.test(comps)) continue; // reminders-only lists
    const url = new URL(href, base).toString();
    const color = text(response, "calendar-color")?.slice(0, 7);
    out.push({
      url,
      name: text(response, "displayname") || "iCloud",
      color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined,
    });
  }
  return out;
}

/** Signs in and lists the account's event calendars. Throws ICloudError. */
export async function discoverCalendars(creds: ICloudCredentials): Promise<ICloudCalendar[]> {
  const root = await dav(creds, "PROPFIND", ROOT, "0", PROPFIND("<d:current-user-principal/>"));
  const principalHref = text(elements(root.xml, "current-user-principal")[0] ?? "", "href");
  if (!principalHref) throw new ICloudError("bad_login");
  const principalUrl = new URL(principalHref, root.url).toString();

  const principal = await dav(creds, "PROPFIND", principalUrl, "0", PROPFIND("<c:calendar-home-set/>"));
  const homeHref = text(elements(principal.xml, "calendar-home-set")[0] ?? "", "href");
  if (!homeHref) throw new ICloudError("server");
  const homeUrl = new URL(homeHref, principal.url).toString();

  const home = await dav(
    creds,
    "PROPFIND",
    homeUrl,
    "1",
    PROPFIND("<d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><x:calendar-color/>"),
  );
  return parseCalendarList(home.xml, home.url);
}

function caldavTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** iCalendar text of every event in a calendar that overlaps [timeMin, timeMax). */
export async function fetchCalendarData(
  creds: ICloudCredentials,
  calendarUrl: string,
  timeMin: Date,
  timeMax: Date,
): Promise<string[]> {
  const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${caldavTime(timeMin)}" end="${caldavTime(timeMax)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const { xml } = await dav(creds, "REPORT", calendarUrl, "1", body);
  return elements(xml, "calendar-data")
    .map(decodeXml)
    .filter((t) => t.includes("BEGIN:VCALENDAR"));
}
