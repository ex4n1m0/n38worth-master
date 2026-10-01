import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCrewJobViews, getCrewRoster, runCrewJob } from "@/lib/crew-job-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const userId = parseInt(session.user.id);
    const [views, roster] = await Promise.all([getCrewJobViews(userId), getCrewRoster(userId)]);
    return NextResponse.json({ ...views, roster }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Crew jobs view error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const jobKey = typeof body?.jobKey === "string" ? body.jobKey : "";
    const crewCardIds = Array.isArray(body?.crewCardIds) ? body.crewCardIds.map(Number) : [];
    const result = await runCrewJob(parseInt(session.user.id), jobKey, crewCardIds);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Crew job run error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
