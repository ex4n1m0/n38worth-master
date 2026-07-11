import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    PUSHER_APP_ID: process.env.PUSHER_APP_ID ? "set" : "MISSING",
    PUSHER_SECRET: process.env.PUSHER_SECRET ? "set" : "MISSING",
    NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY ? "set" : "MISSING",
    NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "MISSING",
    keyPreview: process.env.NEXT_PUBLIC_PUSHER_KEY?.slice(0, 6) ?? "none",
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "none",
  });
}
