"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PlayerCard } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Search, Loader2, ChevronLeft, ChevronRight, Crown, User, CreditCard } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { navbarBtnStyle } from "@/lib/utils";
import { PROFESSIONS } from "@/lib/professions";

const SORT_OPTIONS = [
  { key: "most-owned", label: "Most Owned" },
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "most-hired", label: "Most Hired" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
] as const;

export default function PlayersPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("most-owned");
  const [hasOwner, setHasOwner] = useState(false);
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [profession, setProfession] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["players", debouncedSearch, page, sort, hasOwner, playerType, profession],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        sort,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(hasOwner && { hasOwner: "true" }),
        ...(playerType && { playerType }),
        ...(profession && { profession }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    refetchInterval: 60 * 1000, // Update every minute for estimated deletion
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Users className="h-8 w-8 text-t2-400" />
          {t.browsePlayers}
        </h1>
        <p className="text-gray-400 mt-1">
          {t.browsePlayers}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder={t.searchPlayers}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {SORT_OPTIONS.map((s) => {
            const labelMap: Record<string, string> = {
              "last-online": t.lastOnline,
              "value": t.value,
              "newest": t.newest,
              "name": t.name,
            };
            return (
              <Button
                key={s.key}
                variant="ghost"
                size="sm"
                onClick={() => { setSort(s.key); setPage(1); }}
                className={
                  sort === s.key
                    ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                    : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
                }
                style={navbarBtnStyle}
              >
                {labelMap[s.key] || s.label}
              </Button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setHasOwner(!hasOwner); setPage(1); }}
            className={
              hasOwner
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Crown className="h-3.5 w-3.5 mr-1" />
            {t.hasOwner}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setPlayerType(playerType === "human" ? "" : "human"); setPage(1); }}
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
            onClick={() => { setPlayerType(playerType === "card" ? "" : "card"); setPage(1); }}
            className={
              playerType === "card"
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <CreditCard className="h-3.5 w-3.5 mr-1" />
            NPC
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-500 mr-1">Profession:</span>
        {PROFESSIONS.map((p) => (
          <Button
            key={p.name}
            variant="ghost"
            size="sm"
            onClick={() => { setProfession(profession === p.name ? "" : p.name); setPage(1); }}
            className={
              profession === p.name
                ? "text-amber-300 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <img src={p.imagePath} alt="" className="h-4 w-4 mr-1 object-contain" />
            {p.name}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
        </div>
      ) : data?.players?.length === 0 ? (
        <Card className="border-gray-800 bg-gray-900/60">
          <CardContent className="py-20 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400">{t.noPlayersFound}</p>
            {search && (
              <p className="text-sm text-gray-500 mt-1">{t.searchPlayers}</p>
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
                ownerName?: string | null;
                ownerValue?: number | null;
                purchaseCount?: number;
                bio?: string | null;
              }) => (
                <PlayerCard key={player.id} {...player} />
              )
            )}
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="border-gray-700 text-gray-400"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t.previous}
              </Button>
              <span className="text-sm text-gray-400">
                {t.page} {page} {t.of} {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="border-gray-700 text-gray-400"
              >
                {t.next}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
