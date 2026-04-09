"use client";

import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";

interface AvatarUploadProps {
  currentUrl: string | null;
  username: string;
  avatarCompleted?: boolean;
}

export function AvatarUpload({ currentUrl, username, avatarCompleted = true }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { refresh: refreshOnboarding } = useOnboarding();

  // Custom avatar = user uploaded their own (data: URL). Unsplash URLs don't count.
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

    // Validate file type
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please upload a JPEG, PNG, or WebP image");
      return;
    }

    // Validate file size (2MB)
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
      refreshOnboarding();
      if (data.bonusAwarded) {
        toast.success(`Avatar updated! 🎉 You earned ${data.bonusAmount} bonus credits!`);
      } else {
        toast.success("Avatar updated!");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-row items-center gap-3 sm:gap-4">
      <div className="relative shrink-0">
        <Avatar className="h-32 w-32 sm:h-64 sm:w-64 md:h-[512px] md:w-[512px] max-h-[512px] max-w-[512px] ring-2 ring-gray-700">
          <AvatarImage src={previewUrl || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-lg sm:text-xl font-bold">
            {username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-start w-full max-w-full overflow-hidden">
        {!avatarCompleted ? (
          <Button
            variant="default"
            size="lg"
            onClick={() => { play("buttons"); fileInputRef.current?.click(); }}
            disabled={uploading}
            className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-black font-bold shadow-lg shadow-yellow-500/30 animate-pulse"
          >
            <Camera className="h-5 w-5 mr-2" />
            {uploading ? "Uploading..." : "🎯 Start Here! Change Avatar"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { play("buttons"); fileInputRef.current?.click(); }}
            disabled={uploading}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <Camera className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Change Avatar"}
          </Button>
        )}
        <p className="text-xs text-gray-500 mt-1">
          JPEG, PNG, or WebP. Max 2MB.
        </p>
        {!hasCustomAvatar && bonusAmount && (
          <div className="mt-2 flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 max-w-full">
            <Gift className="h-4 w-4 text-yellow-400 shrink-0" />
            <p className="text-xs sm:text-sm font-bold text-yellow-300 break-words">
              Upload a picture and earn {bonusAmount}¢!
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
          aria-label="Upload avatar image"
        />
      </div>
    </div>
  );
}
