"use client";

import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, Loader2, UserCog, CheckCircle2, Camera, Volume2, VolumeX } from "lucide-react";
import { SquareAvatarUpload } from "@/components/SquareAvatarUpload";
import { redirect } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/components/LanguageContext";
import { useSound, useSoundSettings } from "@/hooks/useSound";

export default function SettingsPage() {
  const { data: session, status, update } = useSession();
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingUsername, setChangingUsername] = useState(false);
  const { t } = useLanguage();
  const { play } = useSound();
  const { muted, volume, setMuted, setVolume } = useSoundSettings();
  const queryClient = useQueryClient();

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", "me-settings"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session,
  });

  if (status === "unauthenticated") {
    redirect("/login");
  }

  const isDemoPlayer = (session?.user?.name || "").startsWith("Demo Player_");
  const avatarChanged =
    !!player?.avatarUrl &&
    player.avatarUrl !== "/hidden.png" &&
    player.avatarUrl !== "/NEW_HIDDEN.png" &&
    player.avatarUrl !== "/NEW_HIDDEN.webp" &&
    !player.avatarUrl.startsWith("Demo Player");

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    play("buttons");
    setChangingPassword(true);

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      play("error");
      toast.error("New passwords do not match");
      setChangingPassword(false);
      return;
    }

    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        play("error");
        toast.error(data.error || "Failed to change password");
      } else {
        play("confirm");
        toast.success("Password changed successfully");
        (e.target as HTMLFormElement).reset();
      }
    } catch {
      play("error");
      toast.error("Something went wrong");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleUsernameChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    play("buttons");
    setChangingUsername(true);

    const formData = new FormData(e.currentTarget);
    const newUsername = (formData.get("newUsername") as string).trim();

    try {
      const res = await fetch("/api/settings/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newUsername }),
      });

      const data = await res.json();

      if (!res.ok) {
        play("error");
        toast.error(data.error || "Failed to change username");
      } else {
        play("confirm");
        toast.success(
          data.converted
            ? "Username changed! Your account is now permanent — it will no longer be deleted."
            : "Username changed! Upload a custom avatar to make your account permanent."
        );
        // Force the JWT to refresh so session.user.name picks up the new username.
        await update({});
        // Refetch player data.
        queryClient.invalidateQueries({ queryKey: ["player", "me-settings"] });
        queryClient.invalidateQueries({ queryKey: ["player"] });
        (e.target as HTMLFormElement).reset();
      }
    } catch {
      play("error");
      toast.error("Something went wrong");
    } finally {
      setChangingUsername(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Settings className="h-8 w-8 text-gray-400" />
          {t.settingsTitle}
        </h1>
        <p className="text-gray-400 mt-1">{t.settingsTitle}</p>
      </div>

      {/* Demo Player Conversion */}
      {isDemoPlayer && (
        <Card className="border-amber-500/40 bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <UserCog className="h-5 w-5 text-amber-400" />
              Convert Demo Account
            </CardTitle>
            <CardDescription className="text-amber-200/70">
              Your demo account will be deleted after 1 hour. Change your
              username AND upload a custom avatar to convert it into a permanent
              account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Conversion checklist */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2
                  className={`h-4 w-4 ${avatarChanged ? "text-green-400" : "text-gray-600"}`}
                />
                <span className={avatarChanged ? "text-green-400" : "text-gray-500"}>
                  {avatarChanged
                    ? "Custom avatar uploaded"
                    : "Upload a custom avatar (below)"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2
                  className={`h-4 w-4 ${!isDemoPlayer ? "text-green-400" : "text-gray-600"}`}
                />
                <span className={!isDemoPlayer ? "text-green-400" : "text-gray-500"}>
                  {!isDemoPlayer ? "Username changed" : "Change your username (below)"}
                </span>
              </div>
            </div>

            <Separator className="bg-amber-500/20" />

            {/* Username change form */}
            <form onSubmit={handleUsernameChange} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="newUsername" className="text-gray-300">
                  New Username
                </Label>
                <Input
                  id="newUsername"
                  name="newUsername"
                  type="text"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="^[a-zA-Z0-9_]+$"
                  placeholder="Choose a new username"
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <p className="text-xs text-gray-500">
                  3–30 characters. Letters, numbers, and underscores only.
                </p>
              </div>
              <Button
                type="submit"
                disabled={changingUsername}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                {changingUsername ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Changing…
                  </>
                ) : (
                  "Change Username"
                )}
              </Button>
            </form>

            {!avatarChanged && (
              <p className="inline-flex items-center gap-1.5 text-sm text-amber-300">
                <Camera className="h-4 w-4" />
                Upload your avatar in the section below
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Change Avatar */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Camera className="h-5 w-5 text-pink-400" />
            Change Avatar
          </CardTitle>
          <CardDescription className="text-gray-400">
            Your avatar is your card&apos;s photo across the whole game.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-[240px]">
            <SquareAvatarUpload
              currentUrl={player?.avatarUrl ?? null}
              username={session?.user?.name || ""}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sound */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            {muted ? (
              <VolumeX className="h-5 w-5 text-gray-400" />
            ) : (
              <Volume2 className="h-5 w-5 text-t1-400" />
            )}
            Sound
          </CardTitle>
          <CardDescription className="text-gray-400">
            Sound effects for buttons and game events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-gray-300">Sound effects</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMuted(!muted);
                if (muted) play("confirm");
              }}
              className={
                muted
                  ? "border-gray-700 bg-gray-800 text-gray-400 hover:text-white"
                  : "border-t1-500/50 bg-t1-900/40 text-t1-400 hover:text-t1-300"
              }
            >
              {muted ? "Off" : "On"}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">Volume</Label>
              <span className="text-xs font-mono text-gray-500">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              disabled={muted}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              onMouseUp={() => play("click")}
              onTouchEnd={() => play("click")}
              className="w-full accent-emerald-500 disabled:opacity-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white">{t.settingsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300">{t.username}</Label>
            <Input
              value={session?.user?.name || ""}
              disabled
              className="bg-gray-800 border-gray-700 text-gray-400"
            />
            <p className="text-xs text-gray-500">
              {t.username}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-gray-300">{t.joined}</Label>
            <Input
              value={
                player?.createdAt
                  ? new Date(player.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : ""
              }
              disabled
              className="bg-gray-800 border-gray-700 text-gray-400"
            />
          </div>
        </CardContent>
      </Card>

      {/* Change Password — hidden for demo players (they have no password) */}
      {!isDemoPlayer && (
        <Card className="border-gray-800 bg-gray-900/60">
          <CardHeader>
            <CardTitle className="text-white">{t.changePassword}</CardTitle>
            <CardDescription className="text-gray-400">
              {t.changePassword}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-gray-300">
                  {t.currentPassword}
                </Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <Separator className="bg-gray-800" />
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-gray-300">
                  {t.newPassword}
                </Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  minLength={6}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-300">
                  {t.confirmNewPassword}
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <Button
                type="submit"
                disabled={changingPassword}
                className="bg-t1-600 hover:bg-t1-500 text-white"
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {t.updatingPassword}
                  </>
                ) : (
                  t.changePassword
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
