"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";

interface SquareAvatarUploadProps {
  currentUrl: string | null;
  username: string;
  avatarCompleted?: boolean;
  /**
   * "full"    — (default) image button + action buttons + bonus note (original behaviour)
   * "banner"  — only the full-width clickable image, no action buttons below
   * "actions" — only the Upload/Random buttons + bonus note + hint, no image
   */
  variant?: "full" | "banner" | "actions";
}

/**
 * Square/card-style avatar upload — matches the PlayerCard avatar format
 * used throughout the Network page. Full-width, aspect-square, rounded-2xl.
 */
export function SquareAvatarUpload({
  currentUrl,
  username,
  avatarCompleted = true,
  variant = "full",
}: SquareAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { refresh: refreshOnboarding } = useOnboarding();
  const { update: updateSession } = useSession();

  const hasCustomAvatar = !!previewUrl && previewUrl.startsWith("data:");

  const { data: stats } = useQuery({
    queryKey: ["game-stats"],
    queryFn: async () => {
      const res = await fetch("/api/game/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: !hasCustomAvatar,
    staleTime: 60 * 1000,
  });

  const bonusAmount = stats?.totalPlayers ? stats.totalPlayers : null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please upload a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      setPreviewUrl(data.avatarUrl);
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      // Force NextAuth to re-issue the JWT with avatarCompleted=true so the
      // server-side middleware lets the user into /leaderboard immediately
      // (otherwise the stale JWT would bounce them back to /my-profile for up
      // to 60 seconds — the JWT verify-interval).
      try {
        await updateSession({ avatarCompleted: true });
      } catch (sessionErr) {
        console.error("Failed to refresh session after avatar upload:", sessionErr);
      }
      await refreshOnboarding();
      if (data.bonusAwarded) {
        toast.success(`Avatar updated! 🎉 You earned ${data.bonusAmount} bonus credits!`);
      } else {
        toast.success("Avatar updated! ✨");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  }

  const imageButton = (
    <button
      type="button"
      onClick={() => {
        play("buttons");
        fileInputRef.current?.click();
      }}
      disabled={uploading}
      className="group relative block w-full overflow-hidden"
      aria-label="Change avatar"
      style={{ display: "block" }}
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={username}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600">
          <span className="text-white font-black text-[15vw] sm:text-[10vw] select-none opacity-60">
            {username.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-4">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Camera className="h-5 w-5" />
          <span>Change Avatar</span>
        </div>
      </div>

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 className="h-10 w-10 animate-spin text-white" />
        </div>
      )}

      {/* Onboarding pulse */}
      {!avatarCompleted && (
        <div className="absolute top-3 right-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-xs font-bold px-2.5 py-1 rounded-full shadow-lg animate-pulse">
          🎯 Upload to unlock
        </div>
      )}

    </button>
  );

  const actionButtons = (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            play("buttons");
            fileInputRef.current?.click();
          }}
          disabled={uploading}
          className="flex-1 border-pink-500/30 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20 hover:text-white"
        >
          <Camera className="h-4 w-4 mr-1.5 shrink-0" />
          {uploading ? "Uploading..." : "Upload Photo"}
        </Button>
      </div>

      {!hasCustomAvatar && bonusAmount && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-yellow-500/15 to-amber-500/15 border border-yellow-500/30">
          <Gift className="h-4 w-4 text-yellow-400 shrink-0" />
          <p className="text-xs font-bold text-yellow-200">
            Upload your own photo and earn {bonusAmount}¢!
          </p>
        </div>
      )}

      <p className="text-[11px] text-gray-500">JPEG, PNG, or WebP · Max 2MB</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleUpload}
        className="hidden"
        aria-label="Upload avatar image"
      />
    </div>
  );

  if (variant === "banner") {
    return (
      <>
        {imageButton}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
          aria-label="Upload avatar image"
        />
      </>
    );
  }

  if (variant === "actions") {
    return <>{actionButtons}</>;
  }

  return (
    <div className="w-full space-y-3">
      <div className="relative overflow-hidden rounded-2xl ring-2 ring-white/10 hover:ring-pink-400/60 transition-all duration-300 shadow-xl shadow-black/40 aspect-square">
        {imageButton}
      </div>
      {actionButtons}
    </div>
  );
}
