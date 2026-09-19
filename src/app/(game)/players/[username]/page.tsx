"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { toast } from "@/lib/event-feed";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerCard } from "@/components/PlayerCard";
import { MarketActionButton } from "@/components/MarketActionButton";
import { PhotoAttribution } from "@/components/PhotoAttribution";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { SquareAvatarUpload } from "@/components/SquareAvatarUpload";
import { ResignButton } from "@/components/ResignButton";
import { BlockSellButton } from "@/components/BlockSellButton";
import { PortfolioRewardCountdown } from "@/components/PortfolioRewardCountdown";
import { RankBonusCountdown } from "@/components/RankBonusCountdown";
import { LoginReward } from "@/components/LoginReward";
import { HourlyRewardCountdown } from "@/components/HourlyRewardCountdown";
import { BossIncomeCard } from "@/components/BossIncomeCard";
import { triggerWorldReboot } from "@/components/WorldRebootingOverlay";
import { useMissionLevel } from "@/hooks/useMissionLevel";
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
  Terminal,
  Coins,
  MessageCircle,
  Wallet,
  ChevronDown,
  Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/LanguageContext";
import { useOnboarding } from "@/components/OnboardingContext";
import { AdminDeletePlayerButton } from "@/components/AdminDeletePlayerButton";
import { OwnedAvatarGrid } from "@/components/OwnedAvatarGrid";
import { EndGameContent } from "@/components/EndGameContent";
import { ProfessionComboBar } from "@/components/ProfessionComboBar";
import { LockedFeature } from "@/components/LockedFeature";
import { useProfessionComboSelection } from "@/hooks/useProfessionComboSelection";
import { UNLOCK_GAME_THRESHOLD } from "@/lib/missions-data";
import { formatNumber, formatLastOnline } from "@/lib/utils";

// Code-split heavy components that are only needed on the profile page.
// These load lazily after the initial render, reducing the initial bundle.
const GlobalChatPage = dynamic(() => import("@/components/GlobalChatPage").then((m) => m.GlobalChatPage), {
  loading: () => <div className="h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>,
});
const LostPlayersGrid = dynamic(() => import("@/components/LostPlayersGrid").then((m) => m.LostPlayersGrid), {
  loading: () => <div className="h-32" />,
});
const InlineDMChat = dynamic(() => import("@/components/InlineDMChat").then((m) => m.InlineDMChat), {
  loading: () => <div className="h-48 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>,
});

const ChangeProfessionDialog = dynamic(() => import("@/components/ChangeProfessionDialog").then((m) => m.ChangeProfessionDialog), {
  ssr: false,
});
const AssignProfessionDialog = dynamic(() => import("@/components/AssignProfessionDialog").then((m) => m.AssignProfessionDialog), {
  ssr: false,
});

const BIO_MAX = 160;

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
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
  const [showRewards, setShowRewards] = useState(true);
  const currentUserId = session?.user?.id ? Number(session.user.id) : null;
  const missionLevel = useMissionLevel();
  const gameUnlocked = missionLevel >= 1;
  // Profession-combo selection — the combo bar renders near the bottom of
  // your own profile, just above Global Chat.
  const combo = useProfessionComboSelection();
  const { ownedIds } = useOwnedPlayerIds();
  const TEAM_PER_PAGE = 18;

  // Scroll to top on page mount / username change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [username]);

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}?lite=1&page=1&limit=999`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: credits } = useCredits();
  const isSpecialCard = !!player?.username && GODDESS_USERNAMES.includes(player.username);
  const heroAvatarFitClass = isSpecialCard ? "object-fill" : "object-cover";
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

  const testResetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/test-reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      return data;
    },
    onSuccess: () => {
      // Trigger the full-screen reboot overlay directly (don't rely on Pusher)
      triggerWorldReboot(session?.user?.name ?? undefined);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const { hasKnowledge } = useKnowledgePower();

  const isOwnProfileEarly =
    !!session?.user?.name &&
    session.user.name.toLowerCase() === username.toLowerCase();
  const hasPlayer = !!player;

  // After a fresh login/registration, give the player a moment to see their
  // profile (and auto-claim the daily reward), then guide them to Cards.
  useEffect(() => {
    if (
      !isOwnProfileEarly ||
      isLoading ||
      !hasPlayer ||
      onboardingLoading ||
      !onboarding.onboardingComplete ||
      sessionStorage.getItem("auto-navigate-cards") !== "1"
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      sessionStorage.removeItem("auto-navigate-cards");
      router.push("/leaderboard");
    }, 10_000);

    return () => window.clearTimeout(timeout);
  }, [isOwnProfileEarly, isLoading, hasPlayer, onboardingLoading, onboarding.onboardingComplete, router]);

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
  // "View full image" — same rules as the market cards had: hidden for
  // Unsplash-sourced photos (they get attribution links instead); data-URL
  // avatars open via the avatar API endpoint.
  const isShowingUnsplashPhoto = !!player.photoSourceUrl && heroAvatarSrc === player.avatarUrl;
  const showFullImageLink = !isShowingUnsplashPhoto && !!heroAvatarSrc;
  const fullImageLinkUrl = heroAvatarSrc?.startsWith("data:")
    ? `/api/avatar/${encodeURIComponent(player.username)}`
    : heroAvatarSrc;
  const bioCost = isNpc ? 1000 : 0;
  const canEditBio = isOwnProfile || (isNpc && viewerOwnsTarget);
  const alreadyOwns = player.owners?.some((o: { username: string }) => o.username === session?.user?.name);
  // The player's primary owner ("boss"), shown in the mirrored hero header.
  const profileOwner = (player?.owners?.[0] ?? null) as {
    id: number;
    username: string;
    avatarUrl: string | null;
    playerValue: number;
    ownershipId: number;
  } | null;

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

      {isDemoPlayer && isOwnProfile && (
        <div className="border border-amber-500/30 rounded-lg p-3 mb-4">
          <p className="text-amber-400 text-3xl font-semibold text-center">
            ⚠️ Demo Player: This account will be automatically deleted after 1 hour
          </p>
          <p className="text-amber-300/70 text-2xl text-center mt-1">
            Go to <a href="/settings" className="underline hover:text-amber-200">Settings</a> to change your username and avatar to make this account permanent
          </p>
        </div>
      )}

      <Card className="relative border-0 bg-transparent overflow-hidden p-0 rounded-3xl">
        {inOnboarding ? (
          <div className="relative w-full flex justify-start rounded-t-3xl overflow-hidden py-4 px-4">
            <div className="relative rounded-lg overflow-hidden w-[150px] h-[150px]">
              <SquareAvatarUpload currentUrl={player.avatarUrl ?? null} username={player.username} avatarCompleted={onboarding.avatarCompleted} variant="banner" />
            </div>
          </div>
        ) : (
          /* Mirrored hero: the player on the left, their owner ("leader") on
             the right — same avatar sizes, same stat rows, icons mirrored. */
          <div className="relative w-full grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-t-3xl overflow-hidden py-4 px-4">
            {/* ── The player (left half) ── */}
            <div className="flex items-start gap-3 sm:gap-4 min-w-0">
              <div className="relative rounded-lg overflow-hidden w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 shrink-0">
                {isOwnProfile ? (
                  <SquareAvatarUpload currentUrl={player.avatarUrl ?? null} username={player.username} avatarCompleted={onboarding.avatarCompleted} variant="banner" />
                ) : (
                  <img src={heroAvatarSrc} alt={player.username} className={`w-full h-full ${heroAvatarFitClass}`} />
                )}
                {!isOwnProfile && player.isActive === 0 && (
                  <div className="absolute top-2 left-2 bg-red-500/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">Inactive</div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-2xl font-black text-white break-all leading-tight">{player.username}</h1>
                  <div className="flex items-center gap-1 mt-0.5">
                    {player.valueFloor >= 100 && (
                      <Gem className="h-5 w-5 text-purple-400 shrink-0 drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]" />
                    )}
                    {player.valueFloor >= 10 && player.valueFloor < 100 && (
                      <Star className="h-5 w-5 text-yellow-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                    )}
                    {isOwnProfile && (
                      <Badge className="bg-gradient-to-r from-t1-500 to-t2-500 text-white border-0 shrink-0"><Sparkles className="h-3 w-3 mr-1" />You</Badge>
                    )}
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-sm">
                  <TrendingUp className="h-3.5 w-3.5 text-t1-400 shrink-0" />
                  <span className="text-gray-500">Value</span>
                  <span className="font-mono font-bold text-white">{formatNumber(player.playerValue)}¢</span>
                </p>
                <p className="flex items-center gap-1.5 text-sm">
                  <Coins className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                  <span className="text-gray-500">Credits</span>
                  <span className="font-mono font-bold text-yellow-300">{formatNumber(player.credits ?? 0)}¢</span>
                </p>

                {/* Badges, bio, and meta — directly under the player's own
                    stats instead of in the separate section below the hero. */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-gray-300 bg-white/5 border-white/20">
                    {isNpc ? <CreditCard className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {isNpc ? "NPC" : "Human"}
                  </span>
                  {(player.photoScore ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-amber-300 bg-amber-500/10 border-amber-500/30">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      Score {formatNumber(player.photoScore)}
                    </span>
                  )}
                  {isOwnProfile && <ChangeProfessionDialog username={player.username} />}
                  {!isOwnProfile && viewerOwnsTarget && !isSpecialCard && (
                    <AssignProfessionDialog
                      targetId={player.id}
                      targetUsername={player.username}
                      currentProfession={heroProfession}
                    />
                  )}
                </div>

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

                <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1 flex-wrap">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(player.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                  <span className="w-1 h-1 rounded-full bg-gray-600" />
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{player.lastOnlineAt ? formatLastOnline(player.lastOnlineAt) : "Never seen"}</span>
                  {showFullImageLink && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-gray-600" />
                      <a
                        href={fullImageLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 underline-offset-2 hover:text-t1-300 hover:underline"
                      >
                        <Eye className="h-3 w-3" />
                        View full image
                      </a>
                    </>
                  )}
                  {player.photoAuthorName && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-gray-600" />
                      <PhotoAttribution
                        authorName={player.photoAuthorName}
                        authorUrl={player.photoAuthorUrl}
                        sourceUrl={player.photoSourceUrl}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── The owner (right half, mirrored: avatar on the outer right
                edge, text right-aligned, icons trailing) ── */}
            <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-row-reverse text-right">
              {profileOwner ? (
                <>
                  <a
                    href={`/players/${profileOwner.username}`}
                    className="relative rounded-lg overflow-hidden w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 shrink-0 ring-2 ring-yellow-500/30 hover:ring-yellow-500/60 transition-all block"
                    aria-label={`View ${profileOwner.username}'s profile`}
                  >
                    <Avatar className="w-full h-full rounded-lg">
                      <AvatarImage
                        src={`/api/avatar/${encodeURIComponent(profileOwner.username)}`}
                        alt={profileOwner.username}
                        className="object-cover"
                      />
                      <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-2xl">
                        {profileOwner.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </a>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start gap-2 flex-wrap justify-end">
                      <h2 className="text-lg sm:text-2xl font-black text-white break-all leading-tight">
                        <a href={`/players/${profileOwner.username}`} className="hover:text-yellow-300 transition-colors">
                          {profileOwner.username}
                        </a>
                      </h2>
                      <Terminal className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                    </div>
                    <p className="flex items-center gap-1.5 text-sm justify-end">
                      <span className="text-gray-500">Value</span>
                      <span className="font-mono font-bold text-yellow-300">{formatNumber(profileOwner.playerValue)}¢</span>
                      <TrendingUp className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                    </p>
                    <p className="flex items-center gap-1.5 text-sm justify-end">
                      <span className="font-semibold text-yellow-400/90">{isOwnProfile ? "Your Leader" : `${player.username}'s Leader`}</span>
                      <Terminal className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative rounded-lg w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 shrink-0 border-2 border-dashed border-gray-700 bg-gray-900/40 flex items-center justify-center">
                    <Terminal className="h-8 w-8 text-gray-600" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h2 className="text-lg sm:text-2xl font-black text-gray-500 leading-tight">No leader yet</h2>
                    <p className="text-sm text-gray-500 leading-snug">
                      When someone hires {isOwnProfile ? "you" : player.username}, they&apos;ll appear here.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!isOwnProfile && (
        <div className="relative border border-white/10 rounded-b-3xl px-5 sm:px-8 py-5 space-y-3">
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
            {/* Admin-only hard-delete (self-renders null for non-admins). */}
            <AdminDeletePlayerButton
              targetId={player.id}
              targetUsername={player.username}
              targetValue={player.playerValue}
              ownerCount={player.ownerCount}
              ownedCount={player.ownedCount}
            />
          </div>
        </div>
        )}
      </Card>

      {/* Avatar grid of this player's owned cards, most valuable first —
          same look as the landing page grid, each avatar links to the card's
          profile. */}
      {!isOwnProfile && !inOnboarding && player?.ownedPlayers?.length > 0 && (
        <OwnedAvatarGrid
          ownerUsername={player.username}
          players={player.ownedPlayers}
          isOwnProfile={false}
        />
      )}

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
          {/* Avatar grid of your owned cards, most valuable first. */}
          {player?.ownedPlayers?.length > 0 && (
            <OwnedAvatarGrid
              ownerUsername={player.username}
              players={player.ownedPlayers}
              isOwnProfile
            />
          )}

          {/* End Game content (How to Win + goddesses) — right under your
              owned-cards avatar grid on your own profile. The Hall of
              Champions lives at the top of the History page. */}
          <div className="pt-6 border-t border-white/10">
            <EndGameContent />
          </div>

          {/* Rewards & Income — collapsible, open by default.
              Hidden until the player completes mission 0 (Own 20 cards). */}
          {gameUnlocked && currentUserId && (
            <div className="rounded-2xl border border-gray-800 overflow-hidden">
              <button
                onClick={() => setShowRewards((v) => !v)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="flex items-center gap-2 font-bold text-white">
                  <Wallet className="h-5 w-5 text-t1-400" />
                  Your Rewards &amp; Income
                </span>
                <span className="flex items-center gap-2">
                  <HourlyRewardCountdown />
                  <ChevronDown
                    className={`h-5 w-5 text-gray-400 transition-transform ${showRewards ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {showRewards && (
                <div className="p-4 pt-0 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <PortfolioRewardCountdown />
                    <RankBonusCountdown />
                    <BossIncomeCard userId={currentUserId} />
                  </div>
                  <LoginReward />
                </div>
              )}
            </div>
          )}
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
            <FilterPill active={teamPlayerType === "human"} onClick={() => { setTeamPlayerType(teamPlayerType === "human" ? "" : "human"); setTeamPage(1); }} tone="amber"><User className="h-3 w-3" /> Human</FilterPill>
            <FilterPill active={teamPlayerType === "card"} onClick={() => { setTeamPlayerType(teamPlayerType === "card" ? "" : "card"); setTeamPage(1); }} tone="amber"><CreditCard className="h-3 w-3" /> NPC</FilterPill>
            <span className="w-px h-4 bg-gray-700 mx-1" />
            <FilterPill active={hasPlayersFilter} onClick={() => { setHasPlayersFilter(!hasPlayersFilter); setTeamPage(1); }} tone="amber"><Users className="h-3 w-3" /> Has Team</FilterPill>
            <FilterPill active={noPartnerFilter} onClick={() => { setNoPartnerFilter(!noPartnerFilter); setTeamPage(1); }} tone="amber"><Shield className="h-3 w-3" /> Available</FilterPill>
          </div>
          <ProfessionFilterBar
            selected={teamProfession}
            onSelect={(name) => { setTeamProfession(name); setTeamPage(1); }}
          />

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {teamPaginated.map((p: { id: number; username: string; avatarUrl: string | null; playerValue: number; valueFloor?: number; ownerCount: number; ownedCount: number; credits?: number; portfolioValue?: number; blockSellUntil?: string | Date | null; permBlockUntil?: string | Date | null; estimatedDeletionAt?: string | Date | null; isActive?: number; lastOnlineAt?: string | Date | null; totalOnlineMinutes?: number; createdAt?: string | Date | null; isVerified?: number; playerType?: string; photoAuthorName?: string | null; photoAuthorUrl?: string | null; photoSourceUrl?: string | null; lastRankBonusAt?: string | Date | null; ownerName?: string | null; ownerValue?: number | null; purchaseCount?: number; bio?: string | null; profession?: string | null; avatarRevealUntil?: string | Date | null; onboardingComplete?: number }) => (
              <PlayerCard key={p.id} {...p} leaderboardMode alwaysShowAvatar />
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

      {!inOnboarding && <LostPlayersGrid profileUsername={username} />}

      {/* Chat channels at the bottom of your own profile: the global room
          (hidden until mission 0 is complete) and the DM channel with your
          leader. The leader identity itself lives in the mirrored hero
          header at the top of this page. */}
      {isOwnProfile && !inOnboarding && (
        <>
          {/* Profession combo bar — moved here from the Avatars tab, just
              above Global Chat. Locked preview until mission 0 is complete. */}
          {gameUnlocked ? (
            <ProfessionComboBar combo={combo} />
          ) : (
            <LockedFeature
              title="Profession combos — collect all 6, sell for 10×"
              ownedCount={player.pagination?.total ?? player.ownedPlayers.length}
              threshold={UNLOCK_GAME_THRESHOLD}
            />
          )}
          {gameUnlocked && <GlobalChatPage embedded />}
          {profileOwner && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Terminal className="h-5 w-5 text-yellow-400" />My Leader<span className="text-sm font-normal text-gray-400">— {profileOwner.username}</span></h2>
              <div className="space-y-3 border border-gray-800 rounded-xl bg-gray-900/60 p-4">
                <div className="flex justify-end gap-2 flex-wrap"><ResignButton ownershipId={profileOwner.ownershipId} ownerUsername={profileOwner.username} userCredits={player?.credits ?? 0} /></div>
                <ChatProvider><div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4" style={{ minHeight: "340px" }}><InlineDMChat targetId={profileOwner.id} targetUsername={profileOwner.username} targetAvatarUrl={`/api/avatar/${encodeURIComponent(profileOwner.username)}`} /></div></ChatProvider>
              </div>
            </div>
          )}

          {/* Danger zone — very bottom of your own profile, below the chats. */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            {session?.user?.name === "IgorCarlier" && (
              <button
                onClick={() => {
                  if (confirm("This will RESET THE ENTIRE GAME (test mode, no Hall of Fame entry). All ownership, credits, and progress will be wiped. Are you sure?")) {
                    testResetMutation.mutate();
                  }
                }}
                disabled={testResetMutation.isPending}
                className="w-full rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
              >
                {testResetMutation.isPending ? "Resetting World..." : "Test World Reset (No HoF)"}
              </button>
            )}
            <DeleteAccountButton playerValue={player.playerValue} ownerCount={player.ownerCount} ownedCount={player.ownedCount} />
          </div>
        </>
      )}
    </div>
  );
}