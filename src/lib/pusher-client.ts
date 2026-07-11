"use client";

import PusherClient from "pusher-js";

// Public Pusher credentials — these are meant to be visible in client-side code
// (that's what the NEXT_PUBLIC_ prefix means). Hardcoded as fallback because
// Vercel sometimes doesn't bake NEXT_PUBLIC_ vars into the build.
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY || "d9084d2cfa6f9a6bc2c1";
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1";

let pusherInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (!PUSHER_KEY || !PUSHER_CLUSTER) {
    console.warn("[Pusher] No key/cluster configured");
    return null;
  }
  if (!pusherInstance) {
    console.log("[Pusher] Initializing with key", PUSHER_KEY.slice(0, 6) + "...", "cluster", PUSHER_CLUSTER);
    pusherInstance = new PusherClient(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
    });
  }
  return pusherInstance;
}
