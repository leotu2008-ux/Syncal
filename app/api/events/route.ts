import { NextResponse, type NextRequest } from "next/server";
import { loadEvents } from "@/lib/calendar";
import { getSessionEmail } from "@/lib/session";

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!(await getSessionEmail())) {
    return NextResponse.json({ error: "Sign in to see calendars." }, { status: 401 });
  }

  const start = new Date(request.nextUrl.searchParams.get("start") ?? "");
  const end = new Date(request.nextUrl.searchParams.get("end") ?? "");
  const span = end.getTime() - start.getTime();
  if (Number.isNaN(span) || span <= 0 || span > MAX_RANGE_MS) {
    return NextResponse.json(
      { error: "start and end must be ISO dates less than 62 days apart." },
      { status: 400 },
    );
  }

  return NextResponse.json(await loadEvents(start, end), {
    headers: { "cache-control": "private, no-store" },
  });
}
