import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildMicrosoftAuthUrl, microsoftConfigured } from "@/lib/microsoft";
import { cookieOptions, getSessionEmail, MS_STATE_COOKIE } from "@/lib/session";

/** Starts connecting an Outlook account to the signed-in person. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!(await getSessionEmail())) return NextResponse.redirect(new URL("/", origin));
  if (!microsoftConfigured()) {
    return NextResponse.redirect(new URL("/settings?ms_error=not_set_up#accounts", origin));
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(MS_STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  const redirectUri = new URL("/api/auth/microsoft/callback", origin).toString();
  return NextResponse.redirect(buildMicrosoftAuthUrl(redirectUri, state));
}
