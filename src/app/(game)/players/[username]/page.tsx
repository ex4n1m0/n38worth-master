"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerCard } from "@/components/PlayerCard";
import { MarketActionButton } from "@/components/MarketActionButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { SquareAvatarUpload } from "@/components/SquareAvatarUpload";
import { GlobalChatPage } from "@/components/GlobalChatPage";
import { LostPlayersGrid } from "@/components/LostPlayersGrid";
import { InlineDMChat } from "@/components/InlineDMChat";
import { ResignButton } from "@/components/ResignButton";
import { BlockSellButton } from "@/components/BlockSellButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCredits } from "@/hooks/useCredits";
import { useKnowledgePower } from "@/hooks/useKnowledgePower";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { ChatProvider } from "@/contexts/ChatContext";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { getProfessionImage } from "@/lib/professions";
import { SortBar, ProfessionFilterBar, FilterPill, type SortDir } from "@/components/PlayerFilters";
import {
  TrendingUp,
  Loader2,
  Star,
  Gem,
  Shield,
  Swords,
  Calendar,
  Clock,
  Camera,
  Sparkles,
  Pencil,
  X,
  Check,
  Users,
  CreditCard,
  User,
  Search,
  Crown,
  MessageCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/LanguageContext";
import { useOnboarding } from "@/components/OnboardingContext";
import { AdminDeletePlayerButton } from "@/components/AdminDeletePlayerButton";
import { isAdminUser } from "@/lib/admins";
import {
  getOwnedRank,
  getValueRank,
  getOwnedRankColor,
  getValueRankColor,
} from "@/lib/ranks";
import { formatNumber, formatLastOnline } from "@/lib/utils";

const BIO_MAX = 160;

export default function PlayerProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(params.username as string);
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { state: onboarding, loading: onboardingLoading } = useOnboarding();
  const queryClient = useQueryClient();
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamPlayerType, setTeamPlayerType] = useState<"" | "human" | "card">("");
  const [teamSort, setTeamSort] = useState<string>("last-online");
  const [teamDir, setTeamDir] = useState<SortDir>("desc");
  const [teamProfession, setTeamProfession] = useState("");
  const [hasPlayersFilter, setHasPlayersFilter] = useState(false);
  const [noPartnerFilter, setNoPartnerFilter] = useState(false);
  const [teamPage, setTeamPage] = useState(1);
  const [heroAvatarRevealUntil, setHeroAvatarRevealUntil] = useState<string | null>(null);
  const { ownedIds } = useOwnedPlayerIds();
  const TEAM_PER_PAGE = 18;

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}?lite=1&page=1&limit=999`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    refetchInterval: 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: credits } = useCredits();
  const isSpecialCard =
    !!player?.username && GODDESS_USERNAMES.includes(player.username);
  const heroProfession = isSpecialCard ? null : player?.profession ?? null;
  const professionImage = getProfessionImage(heroProfession);

  const bioMutation = useMutation({
    mutationFn: async (bio: string) => {
      const res = await fetch("/api/settings/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: player?.id, bio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save bio");
      return data;
    },
    onSuccess: () => {
      toast.success("Bio updated!");
      setBioEditing(false);
      queryClient.invalidateQueries({ queryKey: ["player", username] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const { hasKnowledge } = useKnowledgePower();

  const isOwnProfileEarly =
    !!session?.user?.name &&
    session.user.name.toLowerCase() === username.toLowerCase();

  const teamItemsNoAvatars = useMemo(() => {
    const all = player?.ownedPlayers ?? [];

    const filtered = all.filter((p: {
      username: string;
      playerType?: string;
      profession?: string | null;
      ownedCount?: number;
      blockSellUntil?: string | null;
    }) => {
      const matchSearch = !teamSearch || p.username.toLowerCase().includes(teamSearch.toLowerCase());
      const matchType = !teamPlayerType || p.playerType === teamPlayerType;
      const matchProfession = !teamProfession || p.profession === teamProfession;
      const matchHasPlayers = !hasPlayersFilter || (p.ownedCount ?? 0) > 0;
      const matchNoPartner = !noPartnerFilter || !p.blockSellUntil || new Date(p.blockSellUntil) <= new Date();
      return matchSearch && matchType && matchProfession && matchHasPlayers && matchNoPartner;
    });

    // Single-select sort (Core 6) with an Asc/Desc toggle. Each case computes a
    // descending comparison; `mult` flips it for ascending.
    const mult = teamDir === "asc" ? -1 : 1;
    filtered.sort((a: { lastOnlineAt?: string | null; playerValue?: number; credits?: number; createdAt?: string | null; purchaseCount?: number; photoScore?: number }, b: { lastOnlineAt?: string | null; playerValue?: number; credits?: number; createdAt?: string | null; purchaseCount?: number; photoScore?: number }) => {
      let cmp = 0;
      switch (teamSort) {
        case "last-online":
          cmp = new Date(b.lastOnlineAt || 0).getTime() - new Date(a.lastOnlineAt || 0).getTime();
          break;
        case "value":
          cmp = (b.playerValue ?? 0) - (a.playerValue ?? 0);
          break;
        case "credits":
          cmp = (b.credits ?? 0) - (a.credits ?? 0);
          break;
        case "score":
          cmp = (b.photoScore ?? 0) - (a.photoScore ?? 0);
          break;
        case "newest":
          cmp = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          break;
        case "hired-times":
          cmp = (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0);
          break;
        default:
          cmp = 0;
      }
      return mult * cmp;
    });

    return filtered;
  }, [player?.ownedPlayers, teamSearch, teamPlayerType, teamProfession, teamSort, teamDir, hasPlayersFilter, noPartnerFilter]);

  const teamTotalPages = Math.max(1, Math.ceil(teamItemsNoAvatars.length / TEAM_PER_PAGE));
  const teamCurrentPage = Math.min(teamPage, teamTotalPages);
  const teamPageSliceNoAvatars = teamItemsNoAvatars.slice(
    (teamCurrentPage - 1) * TEAM_PER_PAGE,
    teamCurrentPage * TEAM_PER_PAGE
  );

  const visibleAvatarIds = useMemo(
    () => teamPageSliceNoAvatars.map((p: { id: number }) => p.id).sort((a: number, b: number) => a - b),
    [teamPageSliceNoAvatars]
  );

  const { data: ownedAvatarsData } = useQuery<{ avatarMap: Record<string, string | null> }>({
    queryKey: ["owned-avatars", username, visibleAvatarIds],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}/owned-avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: visibleAvatarIds }),
      });
      if (!res.ok) return { avatarMap: {} };
      return res.json();
    },
    enabled: isOwnProfileEarly && visibleAvatarIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const teamPaginated = useMemo(() => {
    const avatarMap = ownedAvatarsData?.avatarMap ?? {};
    return teamPageSliceNoAvatars.map((p: { id: number; avatarUrl: string | null }) => ({
      ...p,
      avatarUrl: avatarMap[String(p.id)] ?? p.avatarUrl,
    }));
  }, [teamPageSliceNoAvatars, ownedAvatarsData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-400" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white">{t.playerNotFound}</h2>
        <p className="text-gray-400 mt-2">&ldquo;{username}&rdquo;</p>
      </div>
    );
  }

  const isOwnProfile = isOwnProfileEarly;
  const showOnboardingMessage = isOwnProfile && !onboarding.avatarCompleted;
  const inOnboarding = isOwnProfile && !onboarding.onboardingComplete;
  const isNpc = player.isNpc === 1;
  const isDemoPlayer = player.username.startsWith("Demo Player");
  const viewerOwnsTarget = ownedIds.has(player.id);
  const heroAvatarSrc = getAvatarSrc({
    avatarUrl: player.avatarUrl,
    playerId: player.id,
    playerUsername: player.username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isGoddess: GODDESS_USERNAMES.includes(player.username),
    isAvatarRevealed:
      (player.avatarRevealUntil ? new Date(player.avatarRevealUntil) > new Date() : false) ||
      (heroAvatarRevealUntil ? new Date(heroAvatarRevealUntil) > new Date() : false),
    viewerHasKnowledge: hasKnowledge,
  });
  const bioCost = isNpc ? 1000 : 0;
  const canEditBio = isOwnProfile || (isNpc && viewerOwnsTarget);
  const alreadyOwns = player.owners?.some((o: { username: string }) => o.username === session?.user?.name);

  if (isOwnProfile && onboardingLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-400" />
      </div>
    );
  }

  if (isOwnProfile && !onboarding.avatarCompleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <p className="text-white text-lg font-semibold">
          Upload a custom profile picture to start your journey!
        </p>
        <SquareAvatarUpload
          currentUrl={player.avatarUrl ?? null}
          username={player.username}
          avatarCompleted={false}
          variant="actions"
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {showOnboardingMessage && (
        <div className="bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border border-yellow-500/40 rounded-xl p-3 sm:p-4 text-center shadow-md">
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 shrink-0" />
            <p className="text-yellow-200 text-base sm:text-lg md:text-xl font-bold">🎯 Your Avatar is your Brand</p>
          </div>
          <p className="text-yellow-300 text-xs sm:text-sm">Upload a custom profile picture to start your journey!</p>
        </div>
      )}

      {isDemoPlayer && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
          <p className="text-amber-400 text-sm font-semibold text-center">
            ⚠️ Demo Player: This account will be automatically deleted after 1 hour
          </p>
        </div>
      )}

      <Card className="relative border-0 bg-transparent overflow-hidden p-0 rounded-3xl">
        <div className="relative w-full flex justify-start rounded-t-3xl overflow-hidden py-4 px-4">
          <div className={`relative rounded-lg overflow-hidden ${inOnboarding ? "w-[150px] h-[150px]" : "w-full md:w-1/2 lg:w-1/3"}`} style={inOnboarding ? {} : { aspectRatio: "1 / 1", flexShrink: 0 }}>
            {isOwnProfile ? (
              <SquareAvatarUpload currentUrl={player.avatarUrl ?? null} username={player.username} avatarCompleted={onboarding.avatarCompleted} variant="banner" />
            ) : (
              <img src={heroAvatarSrc} alt={player.username} className="w-full h-full object-cover" />
            )}
            {!isOwnProfile && player.isActive === 0 && (
              <div className="absolute top-3 left-3 bg-red-500/80 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">Inactive</div>
            )}
          </div>
        </div>

        <div className="relative border border-white/10 backdrop-blur-sm bg-gray-950/70 rounded-b-3xl px-5 sm:px-8 py-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-2 flex-wrap min-w-0">
              <h1 className="text-xl sm:text-4xl font-black text-white break-all leading-tight">{player.username}</h1>
              <div className="flex items-center gap-1 mt-1">
                {player.valueFloor >= 100 && (
                  <Gem className="h-6 w-6 sm:h-7 sm:w-7 text-purple-400 shrink-0 drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]" />
                )}
                {player.valueFloor >= 10 && player.valueFloor < 100 && (
                  <Star className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                )}
                {isOwnProfile && (
                  <Badge className="bg-gradient-to-r from-t1-500 to-t2-500 text-white border-0 shrink-0"><Sparkles className="h-3 w-3 mr-1" />You</Badge>
                )}
              </div>
            </div>
          </div>

          {!inOnboarding && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getValueRankColor(player.playerValue)}`}><TrendingUp className="h-3 w-3" />{getValueRank(player.playerValue).title}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getOwnedRankColor(player.ownedCount)}`}><Swords className="h-3 w-3" />{getOwnedRank(player.ownedCount).title}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-gray-300 bg-white/5 border-white/20"><Shield className="h-3 w-3" />{player.ownerCount} boss{player.ownerCount !== 1 ? "es" : ""}</span>
          </div>
          )}

          {!isOwnProfile && !inOnboarding && (
            <div className="flex flex-col gap-2 sm:max-w-xs">
              {/* Same GET / PUMP action as the marketplace, incl. block bar. */}
              <MarketActionButton
                id={player.id}
                username={player.username}
                playerValue={player.playerValue}
                blockSellUntil={player.blockSellUntil}
                isSelf={isOwnProfile}
              />
              {!alreadyOwns && (credits ?? 0) < player.playerValue && (
                <div className="flex items-center gap-2 text-sm text-red-300"><span className="w-2 h-2 rounded-full bg-red-400" />Need {formatNumber(player.playerValue - (credits ?? 0))} more credits</div>
              )}
            </div>
          )}

          {!inOnboarding && (
          <div>
            {bioEditing ? (
              <div className="flex flex-col gap-2">
                <textarea className="w-full bg-gray-800/80 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-t1-400" rows={3} maxLength={BIO_MAX} value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} placeholder="Write a short bio…" autoFocus />
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${bioDraft.length > BIO_MAX - 10 ? "text-orange-400" : "text-gray-500"}`}>{bioDraft.length}/{BIO_MAX}</span>
                  <div className="flex items-center gap-2">
                    {bioCost > 0 && (<span className="text-[11px] text-amber-400 font-semibold">Costs {bioCost.toLocaleString()}¢</span>)}
                    <button onClick={() => setBioEditing(false)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors"><X className="h-3 w-3" /> Cancel</button>
                    <button onClick={() => bioMutation.mutate(bioDraft)} disabled={bioMutation.isPending} className="flex items-center gap-1 text-xs text-white bg-t1-600 hover:bg-t1-500 disabled:opacity-50 px-2 py-1 rounded transition-colors"><Check className="h-3 w-3" /> Save</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 group/bio">
                {player.bio ? (<p className="text-sm text-gray-300 italic leading-snug flex-1">&ldquo;{player.bio}&rdquo;</p>) : (canEditBio && (<p className="text-xs text-gray-600 italic flex-1">No bio yet.</p>))}
                {canEditBio && (<button onClick={() => { setBioDraft(player.bio ?? ""); setBioEditing(true); }} className="shrink-0 opacity-0 group-hover/bio:opacity-100 transition-opacity text-gray-500 hover:text-t1-400 p-1 rounded" title={bioCost > 0 ? `Edit bio (${bioCost.toLocaleString()}¢)` : "Edit bio"}><Pencil className="h-3.5 w-3.5" /></button>)}
              </div>
            )}
          </div>
          )}

          {!inOnboarding && (
          <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(player.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
            <span className="w-1 h-1 rounded-full bg-gray-600" />
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{player.lastOnlineAt ? formatLastOnline(player.lastOnlineAt) : "Never seen"}</span>
          </div>
          )}
        </div>
      </Card>

      {/* Direct-message chat with this player (other profiles only) — same
          look & feel as the "chat with your leader" box on your own profile. */}
      {!isOwnProfile && !inOnboarding && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-t1-400" />
            Message {player.username}
          </h2>
          <ChatProvider>
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4" style={{ minHeight: "340px" }}>
              <InlineDMChat
                targetId={player.id}
                targetUsername={player.username}
                targetAvatarUrl={getAvatarSrc({
                  avatarUrl: player.avatarUrl,
                  playerId: player.id,
                  playerUsername: player.username,
                  viewerUsername: session?.user?.name,
                  ownedIds,
                })}
              />
            </div>
          </ChatProvider>
        </div>
      )}

      {isOwnProfile && !inOnboarding && (
        <>
          {/* Global chat room */}
          <GlobalChatPage embedded />
          <div className="pt-4 border-t border-white/10"><DeleteAccountButton playerValue={player.playerValue} ownerCount={player.ownerCount} ownedCount={player.ownedCount} /></div>
        </>
      )}

      {/* Owned-players list is only shown on OTHER players' profiles. Your own
          team lives on the Market page (blended into the browse grid) instead. */}
      {!inOnboarding && !isOwnProfile && player?.ownedPlayers?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users className="h-5 w-5 text-t1-400" />{`${username}'s Team`}<span className="text-sm font-normal text-gray-400">({player.pagination?.total ?? player.ownedPlayers.length})</span></h2>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" /><Input placeholder="Search..." value={teamSearch} onChange={(e) => { setTeamSearch(e.target.value); setTeamPage(1); }} className="pl-8 h-8 w-36 bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 text-sm" /></div>
            </div>
          </div>
          <SortBar
            sort={teamSort}
            dir={teamDir}
            onSortChange={(k) => { setTeamSort(k); setTeamPage(1); }}
            onToggleDir={() => { setTeamDir((d) => (d === "asc" ? "desc" : "asc")); setTeamPage(1); }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">Filter:</span>
            <FilterPill active={teamPlayerType === "human"} onClick={() => { setTeamPlayerType(teamPlayerType === "human" ? "" : "human"); setTeamPage(1); }}><User className="h-3 w-3" /> Human</FilterPill>
            <FilterPill active={teamPlayerType === "card"} onClick={() => { setTeamPlayerType(teamPlayerType === "card" ? "" : "card"); setTeamPage(1); }}><CreditCard className="h-3 w-3" /> Card</FilterPill>
            <span className="w-px h-4 bg-gray-700 mx-1" />
            <FilterPill active={hasPlayersFilter} onClick={() => { setHasPlayersFilter(!hasPlayersFilter); setTeamPage(1); }}><Users className="h-3 w-3" /> Has Team</FilterPill>
            <FilterPill active={noPartnerFilter} onClick={() => { setNoPartnerFilter(!noPartnerFilter); setTeamPage(1); }}><Shield className="h-3 w-3" /> Available</FilterPill>
          </div>
          <ProfessionFilterBar
            selected={teamProfession}
            onSelect={(name) => { setTeamProfession(name); setTeamPage(1); }}
          />

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {teamPaginated.map((p: { id: number; username: string; avatarUrl: string | null; playerValue: number; valueFloor?: number; ownerCount: number; ownedCount: number; credits?: number; portfolioValue?: number; blockSellUntil?: string | Date | null; estimatedDeletionAt?: string | Date | null; isActive?: number; lastOnlineAt?: string | Date | null; totalOnlineMinutes?: number; createdAt?: string | Date | null; isVerified?: number; playerType?: string; photoAuthorName?: string | null; photoAuthorUrl?: string | null; photoSourceUrl?: string | null; lastRankBonusAt?: string | Date | null; ownerName?: string | null; ownerValue?: number | null; purchaseCount?: number; bio?: string | null; profession?: string | null; avatarRevealUntil?: string | Date | null; onboardingComplete?: number }) => (
              <PlayerCard key={p.id} {...p} leaderboardMode />
            ))}
          </div>

          {teamTotalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-2">
              <button onClick={() => setTeamPage((p) => Math.max(1, p - 1))} disabled={teamCurrentPage === 1} className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">←</button>
              <span className="text-sm text-gray-400 px-2">{teamCurrentPage} / {teamTotalPages}</span>
              <button onClick={() => setTeamPage((p) => Math.min(teamTotalPages, p + 1))} disabled={teamCurrentPage === teamTotalPages} className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">→</button>
            </div>
          )}
        </div>
      )}

      {isOwnProfile && !inOnboarding && (() => {
        const owner = player?.owners?.[0] ?? null;
        return (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Crown className="h-5 w-5 text-yellow-400" />My Leader{owner && (<span className="text-sm font-normal text-gray-400">— {owner.username}</span>)}</h2>
            {!owner ? (
              <div className="text-center py-10 text-gray-500 border border-gray-800 rounded-xl bg-gray-900/60"><Crown className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>You don&apos;t have a leader yet</p></div>
            ) : (
              <div className="space-y-3 border border-gray-800 rounded-xl bg-gray-900/60 p-4">
                <a href={`/players/${owner.username}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-t1-500 transition-all group">
                  <Avatar className="h-14 w-14 ring-2 ring-yellow-500/30 group-hover:ring-yellow-500/60 transition-all shrink-0"><AvatarImage src={getAvatarSrc({ avatarUrl: owner.avatarUrl, playerId: owner.id, playerUsername: owner.username, viewerUsername: session?.user?.name, ownedIds })} alt={owner.username} /><AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-sm">{owner.username.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0"><h3 className="font-semibold text-white group-hover:text-t1-400 transition-colors text-base">{owner.username}</h3><p className="text-sm text-gray-400 truncate">Value: {formatNumber(owner.playerValue)}¢</p></div>
                  <Crown className="h-5 w-5 text-yellow-400 shrink-0" />
                </a>
                <div className="flex justify-end gap-2 flex-wrap"><ResignButton ownershipId={owner.ownershipId} ownerUsername={owner.username} userCredits={player?.credits ?? 0} /></div>
                <ChatProvider><div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4" style={{ minHeight: "340px" }}><InlineDMChat targetId={owner.id} targetUsername={owner.username} targetAvatarUrl={getAvatarSrc({ avatarUrl: owner.avatarUrl, playerId: owner.id, playerUsername: owner.username, viewerUsername: session?.user?.name, ownedIds })} /></div></ChatProvider>
              </div>
            )}
          </div>
        );
      })()}

      {!inOnboarding && <LostPlayersGrid profileUsername={username} />}
    </div>
  );
}