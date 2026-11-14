import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { allowedEmails, DEMO, requireEnv } from "./config";
import { DEMO_PEOPLE } from "./demo";

const SESSION_COOKIE = "oc_session";
export const STATE_COOKIE = "oc_oauth_state";
export const LINK_COOKIE = "oc_link_account";
export const MS_STATE_COOKIE = "oc_ms_state";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

const SESSION_MAX_AGE = 60 * 60 * 24 * 180;

function sign(value: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET"))
    .update(value)
    .digest("base64url");
}

export function encodeSession(email: string): string {
  const value = Buffer.from(email).toString("base64url");
  return `${value}.${sign(value)}`;
}

export function decodeSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const [value, sig] = raw.split(".");
  if (!value || !sig) return null;
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return Buffer.from(value, "base64url").toString();
}

export async function setSession(email: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, encodeSession(email), {
    ...cookieOptions,
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in person's email, or null. Removing someone from ALLOWED_EMAILS signs them out. */
export async function getSessionEmail(): Promise<string | null> {
  if (DEMO) return DEMO_PEOPLE[0].email;
  const email = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email || !allowedEmails().includes(email)) return null;
  return email;
}
