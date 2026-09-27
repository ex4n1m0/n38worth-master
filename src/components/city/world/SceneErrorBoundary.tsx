"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { CityGrid } from "@/components/city/CityGrid";
import type { CityFamily } from "@/lib/city/types";

/** The fallback "district overview": the kept slice-4 CSS grid + notice. */
function DistrictOverview({ families }: { families: CityFamily[] }) {
  const { t } = useLanguage();
  return (
    <div className="city-world-fallback" role="region" aria-label={t.cityWorldFallbackNotice}>
      <p className="city-world-fallback-notice">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t.cityWorldFallbackNotice}
      </p>
      <CityGrid families={families} />
    </div>
  );
}

interface SceneErrorBoundaryProps {
  families: CityFamily[];
  children: ReactNode;
}

interface SceneErrorBoundaryState {
  error: unknown;
}

/**
 * Runtime degradation ladder (RTS plan §D1): any render/exception from the
 * canvas world swaps in the DOM district overview — the SAME projection,
 * just the slice-4 CSS grid — instead of a blank page. The kill switch
 * stays the `city_enabled` feature flag.
 */
export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): SceneErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[city] scene error, falling back to district overview:", error, info);
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return <DistrictOverview families={this.props.families} />;
    }
    return this.props.children;
  }
}

export { DistrictOverview };
