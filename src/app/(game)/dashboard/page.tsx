"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { OwnershipList } from "@/components/OwnershipList";
import { PlayerCard } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { useCredits } from "@/hooks/useCredits";
import { AvatarUpload } from "@/components/AvatarUpload";
import {
  Coins,
  Crown,
  Users,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscardAllButton } from "@/components/DiscardAllButton";
import { LoginReward } from "@/components/LoginReward";
import { formatNumber, getDynamicInlineFontSize, navbarBtnStyle } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    refetchInterval: 60 * 1000,
  });

  const { data: credits } = useCredits();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
      </div>
    );
  }

  const basePortfolio =
    (player?.playerValue ?? 0) +
    (player?.ownedPlayers?.reduce(
      (sum: number, p: { playerValue: number }) => sum + p.playerValue,
      0
    ) ?? 0);
  const myOwnerCount = player?.ownerCount ?? 0;
  const portfolioValue = basePortfolio * Math.max(myOwnerCount, 1);

  return (
    <div className="space-y-8">
      {/* My Profile */}
      <Card className="border-gray-800 bg-gradient-to-br from-gray-900/80 to-gray-950/80 overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          {/* Profile Header */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            {/* Avatar Upload (stacks vertically on mobile) */}
            <AvatarUpload
              currentUrl={player?.avatarUrl ?? null}
              username={session?.user?.name || ""}
            />
          </div>

          {/* Name + Stats */}
          <div className="mt-4 sm:mt-5">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent truncate">
              {session?.user?.name}
            </h2>

            {/* Stats Row */}
            <div className="flex items-center gap-3 sm:gap-6 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Coins className="h-4 w-4 text-t1-400 shrink-0" />
                <span className={`${getDynamicInlineFontSize(credits ?? 0)} font-bold font-mono text-white truncate`}>
                  {formatNumber(credits ?? 0)}¢
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline shrink-0">credits</span>
              </div>
              <div className="w-px h-5 bg-gray-700 shrink-0" />
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Users className="h-4 w-4 text-purple-400 shrink-0" />
                <span className={`${getDynamicInlineFontSize(portfolioValue)} font-bold font-mono text-white truncate`}>
                  {formatNumber(portfolioValue)}¢
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline shrink-0">portfolio</span>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Login Reward */}
      <LoginReward />

      {/* Browse Players */}
      <BrowsePlayersSection
        search={search}
        onSearch={handleSearch}
        debouncedSearch={debouncedSearch}
      />

      {/* Players You Own */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-t1-400" />
            Players You Own
            <span className="text-sm font-normal text-gray-400">
              ({player?.ownedPlayers?.length ?? 0})
            </span>
          </CardTitle>
          <CardAction>
            <DiscardAllButton
              ownedCount={player?.ownedPlayers?.length ?? 0}
              totalValue={
                player?.ownedPlayers?.reduce(
                  (sum: number, p: { playerValue: number }) => sum + p.playerValue,
                  0
                ) ?? 0
              }
              credits={credits ?? 0}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <OwnershipList
            items={
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
                  lastOnlineAt?: string | null;
                  blockSellUntil?: string | null;
                  blockSellBy?: string | null;
                  estimatedDeletionAt?: string | null;
                }) => ({
                  ...p,
                })
              ) ?? []
            }
            type="owned"
            showDiscard
            showSendCredits
          />
        </CardContent>
      </Card>

      {/* Your Boss */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-400" />
            Your Boss
            <span className="text-sm font-normal text-gray-400">
              ({player?.owners?.length ?? 0})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OwnershipList
            items={
              player?.owners?.map(
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
                  blockSellUntil?: string | null;
                  blockSellBy?: string | null;
                  estimatedDeletionAt?: string | null;
                }) => ({
                  ...p,
                })
              ) ?? []
            }
            type="owners"
            showSellOut
            showBlockSell
            myPlayerValue={player?.playerValue ?? 1}
          />
        </CardContent>
      </Card>

    </div>
  );
}

const SORT_OPTIONS = [
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
] as const;

function BrowsePlayersSection({
  search,
  onSearch,
  debouncedSearch,
}: {
  search: string;
  onSearch: (value: string) => void;
  debouncedSearch: string;
}) {
  const [sort, setSort] = useState("last-online");
  const [hasOwner, setHasOwner] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["players", debouncedSearch, sort, hasOwner],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "12",
        sort,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(hasOwner && { hasOwner: "true" }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="h-5 w-5 text-t2-400" />
          Browse Players
        </h2>
        <p className="text-gray-400 text-sm mt-0.5">
          Find players to add to your portfolio
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {SORT_OPTIONS.map((s) => (
            <Button
              key={s.key}
              variant="ghost"
              size="sm"
              onClick={() => setSort(s.key)}
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
            onClick={() => setHasOwner(!hasOwner)}
            className={
              hasOwner
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Crown className="h-3.5 w-3.5 mr-1" />
            Has Boss
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
      )}
    </div>
  );
}
