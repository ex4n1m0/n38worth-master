"use client";

import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { OwnershipList } from "@/components/OwnershipList";
import { PlayerCard } from "@/components/PlayerCard";
import { ProfessionComboBar } from "@/components/ProfessionComboBar";
import { Input } from "@/components/ui/input";
import { useCredits } from "@/hooks/useCredits";
import { useProfessionComboSelection } from "@/hooks/useProfessionComboSelection";
import { AvatarUpload } from "@/components/AvatarUpload";
import {
  Coins,
  Terminal,
  Users,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscardAllButton } from "@/components/DiscardAllButton";
import { LoginReward } from "@/components/LoginReward";
import { useLanguage } from "@/components/LanguageContext";
import { formatCompact, getDynamicInlineFontSize, navbarBtnStyle } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const combo = useProfessionComboSelection();

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
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
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
                  {formatCompact(credits ?? 0)}¢
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline shrink-0">{t.creditsLabelLower}</span>
              </div>
              <div className="w-px h-5 bg-gray-700 shrink-0" />
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Users className="h-4 w-4 text-purple-400 shrink-0" />
                <span className={`${getDynamicInlineFontSize(portfolioValue)} font-bold font-mono text-white truncate`}>
                  {formatCompact(portfolioValue)}¢
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline shrink-0">{t.portfolioLabelLower}</span>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Login Reward */}
      <LoginReward />

      {/* Profession Combo Bar */}
      <ProfessionComboBar combo={combo} />

      {/* Browse Players */}
      <BrowsePlayersSection
        search={search}
        onSearch={handleSearch}
        debouncedSearch={debouncedSearch}
        comboSelection={{
          isSelected: combo.isSelected,
          onToggle: combo.toggleSelection,
        }}
      />

      {/* Players You Own */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-t1-400" />
            {t.playersYouOwn}
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
                  permBlockUntil?: string | null;
                  estimatedDeletionAt?: string | null;
                  profession?: string | null;
                  playerType?: string;
                  valueFloor?: number;
                }) => ({
                  ...p,
                })
              ) ?? []
            }
            type="owned"
            showDiscard
            showSendCredits
            ownedMode
            comboSelection={{
              isSelected: combo.isSelected,
              onToggle: combo.toggleSelection,
              emptySlotProfessions: new Set(
                combo.slots.filter((s) => !s.player).map((s) => s.profession)
              ),
            }}
          />
        </CardContent>
      </Card>

      {/* Your Boss */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Terminal className="h-5 w-5 text-yellow-400" />
            {t.yourOwners}
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

function BrowsePlayersSection({
  search,
  onSearch,
  debouncedSearch,
  comboSelection,
}: {
  search: string;
  onSearch: (value: string) => void;
  debouncedSearch: string;
  comboSelection?: {
    isSelected: (playerId: number) => boolean;
    onToggle: (player: { playerId: number; username: string; playerValue: number; avatarUrl: string | null; isNpc: number; valueFloor: number }, profession: string) => boolean;
  };
}) {
  const { t } = useLanguage();
  const [sort, setSort] = useState("last-online");
  const [hasOwner, setHasOwner] = useState(false);

  // Labels come from the locale dictionary; keys stay stable for the API sort param.
  const sortOptions = [
    { key: "last-online", label: t.lastOnline },
    { key: "value", label: t.value },
    { key: "newest", label: t.newest },
    { key: "name", label: t.name },
  ] as const;

  const { data, isLoading } = useQuery({
    queryKey: ["players", debouncedSearch, sort, hasOwner],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
        sort,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(hasOwner && { hasOwner: "true" }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    refetchInterval: 300 * 1000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="h-5 w-5 text-t2-400" />
          {t.browsePlayers}
        </h2>
        <p className="text-gray-400 text-sm mt-0.5">
          {t.findPlayersForPortfolio}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder={t.searchPlayers}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {sortOptions.map((s) => (
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
            <Terminal className="h-3.5 w-3.5 mr-1" />
            {t.hasOwner}
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
            <p className="text-gray-400">{t.noPlayersFound}</p>
            {search && (
              <p className="text-sm text-gray-500 mt-1">{t.tryDifferentSearch}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              photoScore?: number;
              bio?: string | null;
              profession?: string | null;
            }) => (
              <PlayerCard key={player.id} {...player} comboSelection={comboSelection} />
            )
          )}
        </div>
      )}
    </div>
  );
}
