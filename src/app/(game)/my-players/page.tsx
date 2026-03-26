"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { OwnershipList } from "@/components/OwnershipList";
import { MyProfileCard } from "@/components/MyProfileCard";
import { DiscardAllButton } from "@/components/DiscardAllButton";
import { InlineDMChat } from "@/components/InlineDMChat";
import {
  Users,
  Loader2,
  Search,
  User,
  CreditCard,
  LayoutGrid,
  List,
} from "lucide-react";
import Link from "next/link";

const SORT_OPTIONS = [
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "credits", label: "Credits" },
  { key: "most-owners", label: "Most Owners" },
  { key: "most-players", label: "Most Players" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
] as const;

export default function MyPlayersPage() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("last-online");
  const [search, setSearch] = useState("");
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [viewMode, setViewMode] = useState<"mosaic" | "details">("mosaic");
  const perPage = 9;

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
  });

  const items =
    player?.ownedPlayers?.map(
      (p: {
        ownershipId: number;
        id: number;
        username: string;
        avatarUrl: string | null;
        playerValue: number;
        purchasePrice: number;
        credits?: number;
        portfolioValue?: number;
        ownerCount?: number;
        ownedCount?: number;
        playerType?: string;
        createdAt?: string | null;
        lastOnlineAt?: string | null;
        blockSellUntil?: string | null;
        blockSellBy?: string | null;
        estimatedDeletionAt?: string | null;
      }) => ({ ...p })
    ) ?? [];

  // Apply search filter
  const searchFiltered = search
    ? items.filter((item: any) =>
        item.username?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  // Apply player type filter
  const filtered = playerType
    ? searchFiltered.filter((item: any) => item.playerType === playerType)
    : searchFiltered;

  const sortedItems = [...filtered].sort((a: any, b: any) => {
    switch (sort) {
      case "value":
        return (b.playerValue ?? 0) - (a.playerValue ?? 0);
      case "credits":
        return (b.credits ?? 0) - (a.credits ?? 0);
      case "most-owners":
        return (b.ownerCount ?? 0) - (a.ownerCount ?? 0);
      case "most-players":
        return (b.ownedCount ?? 0) - (a.ownedCount ?? 0);
      case "newest":
        return (b.ownershipId ?? 0) - (a.ownershipId ?? 0);
      case "name":
        return (a.username ?? "").localeCompare(b.username ?? "");
      case "last-online":
      default: {
        const aTime = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : 0;
        const bTime = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : 0;
        return bTime - aTime;
      }
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
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
    <div className="space-y-6">
      <MyProfileCard />

      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-t1-400" />
            Players You Own
            <span className="text-sm font-normal text-gray-400">
              ({filtered.length})
            </span>
          </CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <DiscardAllButton
                ownedCount={items.length}
                totalValue={
                  items.reduce(
                    (sum: number, p: { playerValue: number }) =>
                      sum + p.playerValue,
                    0
                  ) ?? 0
                }
              />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {/* Search + Sort + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500 h-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* View mode toggle */}
              {viewMode === "mosaic" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode("details")}
                  className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
                >
                  <List className="h-4 w-4 mr-1" />
                  Details
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode("mosaic")}
                  className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Mosaic
                </Button>
              )}
              {SORT_OPTIONS.map((s) => (
                <Button
                  key={s.key}
                  variant={sort === s.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSort(s.key);
                    setPage(1);
                  }}
                  className={
                    sort === s.key
                      ? "bg-t1-600 hover:bg-t1-500 text-white"
                      : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                  }
                >
                  {s.label}
                </Button>
              ))}
              <Button
                variant={playerType === "human" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setPlayerType(playerType === "human" ? "" : "human");
                  setPage(1);
                }}
                className={
                  playerType === "human"
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                }
              >
                <User className="h-3.5 w-3.5 mr-1" />
                Human
              </Button>
              <Button
                variant={playerType === "card" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setPlayerType(playerType === "card" ? "" : "card");
                  setPage(1);
                }}
                className={
                  playerType === "card"
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                }
              >
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                Card
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
            </div>
          ) : (
            <>
              {viewMode === "mosaic" ? (
                /* ── Mosaic View ── */
                paginatedItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No players owned yet
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 sm:gap-2">
                    {paginatedItems.map(
                      (p: {
                        id: number;
                        ownershipId: number;
                        username: string;
                        avatarUrl: string | null;
                        playerValue: number;
                        playerType?: string;
                      }) => (
                        <Link
                          key={p.ownershipId}
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
                            <p className="text-gray-300 text-[10px] sm:text-xs">
                              ₡{p.playerValue?.toLocaleString()}
                            </p>
                          </div>
                          {/* Player type badge */}
                          {p.playerType === "card" && (
                            <div className="absolute top-1 right-1 bg-cyan-600/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                              NPC
                            </div>
                          )}
                        </Link>
                      )
                    )}
                  </div>
                )
              ) : (
                /* ── Details View with Chat inside each card ── */
                <OwnershipList
                  items={paginatedItems}
                  type="owned"
                  showDiscard
                  showSendCredits
                  showChat
                />
              )}

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
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    →
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
