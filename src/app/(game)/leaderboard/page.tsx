"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerCard } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { MyProfileCard } from "@/components/MyProfileCard";
import { CreateNPCButton } from "@/components/CreateNPCButton";
import {
  Crown,
  Users,
  Loader2,
  Search,
  User,
  CreditCard,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";

const SORT_OPTIONS = [
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "credits", label: "Credits" },
  { key: "most-owned", label: "Most Owners" },
  { key: "most-players", label: "Most Players" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
] as const;

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  return (
    <div className="space-y-6">
      {/* My Profile Card */}
      {session?.user?.name && <MyProfileCard />}

      {/* Browse Players */}
      <BrowsePlayersSection
        search={search}
        onSearch={handleSearch}
        debouncedSearch={debouncedSearch}
      />
    </div>
  );
}

function BrowsePlayersSection({
  search,
  onSearch,
  debouncedSearch,
}: {
  search: string;
  onSearch: (value: string) => void;
  debouncedSearch: string;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("last-online");
  const [hasOwner, setHasOwner] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");

  const { data, isLoading } = useQuery({
    queryKey: ["players", debouncedSearch, sort, hasOwner, hasPlayers, playerType, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "9",
        sort,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(hasOwner && { hasOwner: "true" }),
        ...(hasPlayers && { hasPlayers: "true" }),
        ...(playerType && { playerType }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    staleTime: 5 * 1000,
    refetchInterval: 20 * 1000,
  });

  const totalPages = data?.totalPages ?? 1;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
        <CreateNPCButton />
        <div className="flex gap-2 flex-wrap">
          <Link href="/leaderboard/mosaic">
            <Button
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              Mosaic
            </Button>
          </Link>
          {SORT_OPTIONS.map((s) => (
            <Button
              key={s.key}
              variant={sort === s.key ? "default" : "outline"}
              size="sm"
              onClick={() => { setSort(s.key); setPage(1); }}
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
            variant={hasOwner ? "default" : "outline"}
            size="sm"
            onClick={() => { setHasOwner(!hasOwner); setPage(1); }}
            className={
              hasOwner
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }
          >
            <Crown className="h-3.5 w-3.5 mr-1" />
            Has Owner
          </Button>
          <Button
            variant={hasPlayers ? "default" : "outline"}
            size="sm"
            onClick={() => { setHasPlayers(!hasPlayers); setPage(1); }}
            className={
              hasPlayers
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            Has Players
          </Button>
          <Button
            variant={playerType === "human" ? "default" : "outline"}
            size="sm"
            onClick={() => { setPlayerType(playerType === "human" ? "" : "human"); setPage(1); }}
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
            onClick={() => { setPlayerType(playerType === "card" ? "" : "card"); setPage(1); }}
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
      ) : data?.players?.length === 0 ? (
        <Card className="border-gray-800 bg-gray-900/60">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400">No players found</p>
            {search && (
              <p className="text-sm text-gray-500 mt-1">Try a different search term</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data?.players?.map(
              (player: {
                id: number;
                username: string;
                avatarUrl: string | null;
                playerValue: number;
                valueFloor?: number;
                ownerCount: number;
                ownedCount: number;
                credits?: number;
                portfolioValue?: number;
                isActive?: number;
                lastOnlineAt?: string | null;
                estimatedDeletionAt?: string | null;
              }) => (
                <PlayerCard key={player.id} {...player} />
              )
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              {getPageNumbers().map((p, i) =>
                typeof p === "string" ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-500 text-sm">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      p === page
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
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
              <span className="text-xs text-gray-500 ml-2">
                {data?.total ?? 0} players
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
