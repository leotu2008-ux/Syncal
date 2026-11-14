import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthUrl } from "@/lib/google";
import { cookieOptions, LINK_COOKIE, STATE_COOKIE } from "@/lib/session";

/** `?link=1` adds another Google account to the signed-in person instead of signing in. */
export async function GET(request: NextRequest) {
  const state = randomBytes(24).toString("base64url");
  const link = request.nextUrl.searchParams.get("link") === "1";
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
  if (link) cookieStore.set(LINK_COOKIE, "1", { ...cookieOptions, maxAge: 600 });
  else cookieStore.delete(LINK_COOKIE);
  const redirectUri = new URL("/api/auth/callback", request.nextUrl.origin);
  return NextResponse.redirect(buildAuthUrl(redirectUri.toString(), state, link));
}
