import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl } from "@/lib/google";
import { cookieOptions, STATE_COOKIE } from "@/lib/session";

export async function GET(request: NextRequest) {
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  const redirectUri = new URL("/api/auth/callback", request.nextUrl.origin);
  return NextResponse.redirect(buildAuthUrl(redirectUri.toString(), state));
}
