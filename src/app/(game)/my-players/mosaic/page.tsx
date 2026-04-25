"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, User } from "lucide-react";
import Link from "next/link";
import { formatNumber, getDynamicMosaicFontSize } from "@/lib/utils";

const PER_PAGE = 18;

export default function MosaicPage() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 5 * 1000,
  });

  const ownedPlayers: {
    id: number;
    username: string;
    avatarUrl: string | null;
    playerValue: number;
    playerType?: string;
  }[] = player?.ownedPlayers ?? [];

  const totalPages = Math.max(1, Math.ceil(ownedPlayers.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedPlayers = ownedPlayers.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE
  );

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/my-players">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-white">
          My Collection
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({ownedPlayers.length} players)
          </span>
        </h1>
      </div>

      {/* Mosaic Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-t1-400" />
        </div>
      ) : ownedPlayers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <User className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-lg">You don&apos;t own any players yet</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {paginatedPlayers.map((p) => (
              <Link
                key={p.id}
                href={`/players/${p.username}`}
                className="group relative aspect-square overflow-hidden rounded-lg bg-gray-800 border border-gray-800 hover:border-t1-500 transition-all"
              >
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt={p.username}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <User className="h-1/3 w-1/3 text-gray-600" />
                  </div>
                )}
                {/* Overlay with name */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                  <p className="text-white text-xs sm:text-sm font-medium truncate">
                    {p.username}
                  </p>
                  <p className={`text-gray-300 ${getDynamicMosaicFontSize(p.playerValue)}`}>
                    ₡{formatNumber(p.playerValue)}
                  </p>
                </div>
                {/* Player type badge */}
                {p.playerType === "card" && (
                  <div className="absolute top-1 right-1 bg-cyan-600/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                    NPC
                  </div>
                )}
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              {getPageNumbers().map((p, i) =>
                typeof p === "string" ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 text-gray-500 text-sm"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      p === currentPage
                        ? "border-t1-500 bg-t1-600/20 text-t1-400 font-bold"
                        : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
