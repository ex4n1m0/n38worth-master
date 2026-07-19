"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { PlayerCard } from "@/components/PlayerCard";
import { PlayerCardSkeletonGrid } from "@/components/PlayerCardSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Search, Loader2, ChevronLeft, ChevronRight, Crown, User, UserX, CreditCard, Shield, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { SortBar, ProfessionFilterBar, FilterPill, type SortDir } from "@/components/PlayerFilters";
import { useOthersOwnPlayers } from "@/hooks/useOthersOwnPlayers";

export default function PlayersPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("last-online");
  const [dir, setDir] = useState<SortDir>("desc");
  // Ownership (relative to me): "" = all, "none" = no owner, "mine" = I own,
  // "other" = owned by someone else, "owns" = this card owns others.
  // "Others Owned" defaults to ON when other players actually own cards, so
  // players land on a view with stealable targets. Falls back to "none"
  // (No Owner) when nobody else owns anything. The user's manual clicks after
  // mount are authoritative — the effect only sets the initial default once.
  const othersOwnPlayers = useOthersOwnPlayers();
  const [ownerFilter, setOwnerFilter] = useState<"" | "none" | "mine" | "other" | "owns">("none");
  const [ownerFilterInitialized, setOwnerFilterInitialized] = useState(false);
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [hasTeam, setHasTeam] = useState(false);
  const [available, setAvailable] = useState(false);
  const [profession, setProfession] = useState("");
  // Affordable is ON by default — players see only cards they can buy. They
  // can turn it off manually to browse cards they can't afford yet.
  const [affordable, setAffordable] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Always 90 cards per page.
  const pageSize = 90;

  // Settle the ownerFilter default once the other-owners check resolves. Only
  // runs once (guarded by ownerFilterInitialized) so manual clicks win after.
  useEffect(() => {
    if (!ownerFilterInitialized && othersOwnPlayers !== undefined) {
      setOwnerFilter(othersOwnPlayers ? "other" : "none");
      setOwnerFilterInitialized(true);
    }
  }, [othersOwnPlayers, ownerFilterInitialized]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["players", debouncedSearch, page, pageSize, sort, dir, ownerFilter, playerType, hasTeam, available, profession, affordable],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        sort,
        dir,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(ownerFilter && { ownerFilter }),
        ...(playerType && { playerType }),
        ...(hasTeam && { hasPlayers: "true" }),
        ...(available && { noPartner: "true" }),
        ...(profession && { profession }),
        ...(affordable && { affordable: "true" }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    staleTime: 30 * 1000,
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

      {/* Filters — clearly separated, labeled groups. Sort is single-select with
          an Asc/Desc toggle; every filter row below is freely combinable. */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder={t.searchPlayers}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>

        <SortBar
          sort={sort}
          dir={dir}
          onSortChange={(k) => { setSort(k); setPage(1); }}
          onToggleDir={() => { setDir((d) => (d === "asc" ? "desc" : "asc")); setPage(1); }}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Filter:</span>
          <FilterPill active={playerType === "human"} onClick={() => { setPlayerType(playerType === "human" ? "" : "human"); setPage(1); }}>
            <User className="h-3 w-3" /> Human
          </FilterPill>
          <FilterPill active={playerType === "card"} onClick={() => { setPlayerType(playerType === "card" ? "" : "card"); setPage(1); }}>
            <CreditCard className="h-3 w-3" /> NPC
          </FilterPill>
          <span className="w-px h-4 bg-gray-700 mx-1" />
          <FilterPill active={ownerFilter === "none"} onClick={() => { setOwnerFilter(ownerFilter === "none" ? "" : "none"); setPage(1); }}>
            <UserX className="h-3 w-3" /> No Owner
          </FilterPill>
          <FilterPill active={ownerFilter === "mine"} onClick={() => { setOwnerFilter(ownerFilter === "mine" ? "" : "mine"); setPage(1); }}>
            <Crown className="h-3 w-3" /> My Owned
          </FilterPill>
          <FilterPill active={ownerFilter === "other"} onClick={() => { setOwnerFilter(ownerFilter === "other" ? "" : "other"); setPage(1); }}>
            <Users className="h-3 w-3" /> Others Owned
          </FilterPill>
          <FilterPill active={ownerFilter === "owns"} onClick={() => { setOwnerFilter(ownerFilter === "owns" ? "" : "owns"); setPage(1); }}>
            <Users className="h-3 w-3" /> Owns
          </FilterPill>
          <span className="w-px h-4 bg-gray-700 mx-1" />
          <FilterPill active={hasTeam} onClick={() => { setHasTeam(!hasTeam); setPage(1); }}>
            <Users className="h-3 w-3" /> Has Team
          </FilterPill>
          <FilterPill active={available} onClick={() => { setAvailable(!available); setPage(1); }}>
            <Shield className="h-3 w-3" /> Available
          </FilterPill>
          <FilterPill active={affordable} onClick={() => { setAffordable(!affordable); setPage(1); }}>
            <Sparkles className="h-3 w-3" /> Affordable
          </FilterPill>
        </div>

        <ProfessionFilterBar
          selected={profession}
          onSelect={(name) => { setProfession(name); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <PlayerCardSkeletonGrid count={12} />
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
                blockSellUntil?: string | null;
                permBlockUntil?: string | null;
              }) => (
                <PlayerCard key={player.id} {...player} />
              )
            )}
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4 flex-wrap">
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
