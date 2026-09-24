"use client";

import { Camera } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";

interface PhotoAttributionProps {
  authorName?: string | null;
  authorUrl?: string | null;
  sourceUrl?: string | null;
  className?: string;
}

/**
 * Renders the Unsplash photo credit required by their API guidelines:
 * "Photo by {photographer} on Unsplash", linking the photographer to their
 * profile and "Unsplash" to the photo page. Stored URLs already carry the
 * required `utm_source=networth&utm_medium=referral` referral params.
 *
 * Renders nothing when there's no author/link data (e.g. human players or
 * fallback NPCs without an Unsplash photo). Clicks stop propagation so the
 * surrounding (clickable) card doesn't navigate.
 */
export function PhotoAttribution({
  authorName,
  authorUrl,
  sourceUrl,
  className = "",
}: PhotoAttributionProps) {
  const { t } = useLanguage();
  if (!authorName || (!authorUrl && !sourceUrl)) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <span
      className={`inline-flex items-center gap-1 min-w-0 max-w-full text-[10px] text-gray-500 ${className}`}
    >
      <Camera className="h-3 w-3 shrink-0 opacity-70" />
      {/* Only the photographer name truncates on narrow (mobile) cards —
          the "on Unsplash" credit must stay visible per API guidelines. */}
      <span className="min-w-0 truncate" title={authorName}>
        {t.photoBy}{" "}
        {authorUrl ? (
          <a
            href={authorUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="text-gray-400 underline-offset-2 hover:text-t1-300 hover:underline"
          >
            {authorName}
          </a>
        ) : (
          <span className="text-gray-400">{authorName}</span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap">
        {t.photoOn}{" "}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="text-gray-400 underline-offset-2 hover:text-t1-300 hover:underline"
          >
            Unsplash
          </a>
        ) : (
          <span className="text-gray-400">Unsplash</span>
        )}
      </span>
    </span>
  );
}
