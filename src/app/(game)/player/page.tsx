"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlayerProfilePage from "@/components/PlayerProfilePage";

// Query-param profile route for the bundled desktop client (?u=username).
// Path-param /players/[username] remains for web deep links; both render the
// same extracted component. Suspense: useSearchParams requires a boundary
// during static export prerender.
export default function PlayerByQueryPage() {
  return (
    <Suspense fallback={null}>
      <PlayerByQuery />
    </Suspense>
  );
}

function PlayerByQuery() {
  const username = useSearchParams().get("u");
  if (!username) return null;
  return <PlayerProfilePage username={username} />;
}
