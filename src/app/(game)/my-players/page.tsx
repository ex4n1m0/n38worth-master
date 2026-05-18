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
} from "@/components/ui/card";
import { OwnershipList } from "@/components/OwnershipList";
import { formatNumber, navbarBtnStyle } from "@/lib/utils";
import {
  Users,
  Loader2,
  Search,
  User,
  CreditCard,
  Bell,
} from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { ChatProvider, useChat } from "@/contexts/ChatContext";

const SORT_OPTIONS = [
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "credits", label: "Credits" },
  { key: "most-players", label: "Most Players" },
  { key: "most-hired", label: "Most Hired" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
] as const;

function MyPlayersContent() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("value");
  const [search, setSearch] = useState("");
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const { play } = useSound();
  const { unreadPlayers, markAsRead } = useChat();
  const perPage = 18;


  // Count total unread messages
  const totalUnread = unreadPlayers.size;

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
        avatarRevealUntil?: string | null;
        estimatedDeletionAt?: string | null;
        purchaseCount?: number;
        bio?: string | null;
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
      case "most-players":
        return (b.ownedCount ?? 0) - (a.ownedCount ?? 0);
      case "most-hired":
        return (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0);
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

        <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-t1-400" />
            Players You Own
            <span className="text-sm font-normal text-gray-400">
              ({filtered.length})
            </span>
            {totalUnread > 0 && (
              <span className="flex items-center gap-1 text-xs font-normal text-yellow-400 bg-yellow-500/20 px-2 py-0.5 rounded-full">
                <Bell className="h-3 w-3" />
                {totalUnread} unread
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search + Sort + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative w-full sm:max-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search players..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 h-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {SORT_OPTIONS.map((s) => (
                <Button
                  key={s.key}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    play("buttons");
                    setSort(s.key);
                    setPage(1);
                  }}
                  className={
                    sort === s.key
                      ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                      : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
                  }
                  style={navbarBtnStyle}
                >
                  {s.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  play("buttons");
                  setPlayerType(playerType === "human" ? "" : "human");
                  setPage(1);
                }}
                className={
                  playerType === "human"
                    ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                    : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
                }
                style={navbarBtnStyle}
              >
                <User className="h-3.5 w-3.5 mr-1" />
                Human
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  play("buttons");
                  setPlayerType(playerType === "card" ? "" : "card");
                  setPage(1);
                }}
                className={
                  playerType === "card"
                    ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                    : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
                }
                style={navbarBtnStyle}
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
          ) : paginatedItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No players owned yet
            </div>
          ) : (
            <>
              {/* ── Details View with Chat inside each card ── */}
              <OwnershipList
                items={paginatedItems}
                type="owned"
                showSendCredits
                showChat
                showBoost
                showBoostValue
                showRevealAvatar
                showLetGo
                hideHire
              />

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-4">
                  <button
                    onClick={() => { play("buttons"); setPage((p) => Math.max(1, p - 1)); }}
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
                        onClick={() => { play("buttons"); setPage(p); }}
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
                    onClick={() => { play("buttons"); setPage((p) => Math.min(totalPages, p + 1)); }}
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

export default function MyPlayersPage() {
  return (
    <ChatProvider>
      <MyPlayersContent />
    </ChatProvider>
  );
}
