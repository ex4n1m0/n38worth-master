"use client";

/**
 * Skeleton placeholder matching the PlayerCard layout.
 * Shown while real data loads to avoid blank spinners.
 */
export function PlayerCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-gray-950/70 overflow-hidden animate-pulse">
      <div className="flex gap-3 p-3">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-lg bg-gray-800/80 shrink-0" />
        {/* Content */}
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-32 bg-gray-800/80 rounded" />
          <div className="h-3 w-20 bg-gray-800/60 rounded" />
          <div className="h-3 w-24 bg-gray-800/60 rounded" />
        </div>
      </div>
      <div className="flex gap-2 p-3 pt-0">
        <div className="h-8 flex-1 bg-gray-800/60 rounded-lg" />
        <div className="h-8 w-12 bg-gray-800/60 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Grid of skeleton cards for loading states.
 */
export function PlayerCardSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <PlayerCardSkeleton key={i} />
      ))}
    </div>
  );
}
