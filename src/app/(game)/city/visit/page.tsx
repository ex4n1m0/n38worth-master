"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PublicCityView } from "@/components/city/PublicCityView";

// Query-param city-visit route for the bundled desktop client (?u=username).
// The path-param /city/[username] page remains for web share links; this is
// the static-export-safe variant (no dynamic segment to prerender).
export default function CityVisitByQueryPage() {
  return (
    <Suspense fallback={null}>
      <CityVisitByQuery />
    </Suspense>
  );
}

function CityVisitByQuery() {
  const username = useSearchParams().get("u");
  if (!username) return null;
  return <PublicCityView username={username} />;
}
