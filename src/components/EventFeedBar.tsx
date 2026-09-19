"use client";

import { ChevronDown, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useEventFeed, type FeedKind } from "@/lib/event-feed";
import { useSound } from "@/hooks/useSound";

function KindIcon({ kind }: { kind: FeedKind }) {
  switch (kind) {
    case "success":
      return <CircleCheck className="h-3.5 w-3.5 shrink-0 text-green-400" />;
    case "warning":
      return <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
    default:
      return <Info className="h-3.5 w-3.5 shrink-0 text-cyan-400" />;
  }
}

/**
 * Slim game-event row. Standalone (default) it renders as its own bordered
 * bar; `inline` drops the chrome so it can sit inside the header's row 2
 * next to the mission progress.
 */
export function EventFeedBar({ inline = false }: { inline?: boolean }) {
  const { events, expanded, toggleExpanded } = useEventFeed();
  const { play } = useSound();

  const latest = events[0];
  if (!latest) return null;

  const recent = events.slice(0, 10);

  return (
    <div className={inline ? "min-w-0" : "border-b border-gray-800/40 bg-gray-950/85 backdrop-blur-xl"}>
      <div className={inline ? "" : "max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8"}>
        <button
          onClick={() => {
            play("toggle");
            toggleExpanded();
          }}
          className="w-full flex items-center gap-2 sm:gap-3 py-1.5 pl-4 pr-1 min-w-0 text-left"
          aria-expanded={expanded}
          aria-label="Game events — tap to see recent events"
        >
          <KindIcon kind={latest.kind} />
          <span
            key={latest.id}
            className="poach-pop flex-1 truncate text-xs sm:text-sm font-bold text-gray-100 min-w-0"
          >
            {latest.title}
          </span>
          {latest.description && (
            <span className="hidden sm:block truncate text-xs text-gray-400 max-w-[40%]">
              {latest.description}
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div className="border-t border-gray-800/60 pb-1.5 max-h-56 overflow-y-auto">
            {recent.map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1 pl-4 text-xs">
                <KindIcon kind={e.kind} />
                <span className="flex-1 truncate text-gray-200 min-w-0">
                  {e.title}
                  {e.description ? <span className="text-gray-500"> — {e.description}</span> : null}
                </span>
                <span className="shrink-0 text-gray-600 tabular-nums">
                  {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
