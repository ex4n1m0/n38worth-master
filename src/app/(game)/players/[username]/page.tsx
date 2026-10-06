"use client";

import { useParams } from "next/navigation";
import PlayerProfilePage from "@/components/PlayerProfilePage";

// Legacy path route (web deep links + share URLs). The bundled desktop
// client uses /player?u=<username> instead — this page is excluded from
// the static export build (scripts/build-desktop-client.mjs).
export default function PlayerByUsernamePage() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  return <PlayerProfilePage username={username} />;
}
