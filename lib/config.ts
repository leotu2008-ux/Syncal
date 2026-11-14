/**
 * Demo mode fills the calendar with made-up events and skips Google sign-in,
 * so the app can be tried before Google Cloud is set up. Never on in production.
 */
export const DEMO =
  process.env.DEMO_MODE === "1" && process.env.NODE_ENV !== "production";

/** The only Google accounts allowed in, lowercased, in display order. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See README.md.`);
  }
  return value;
}
