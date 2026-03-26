"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, Loader2 } from "lucide-react";
import { redirect } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/components/LanguageContext";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [changingPassword, setChangingPassword] = useState(false);
  const { t } = useLanguage();

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

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setChangingPassword(true);

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
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
        toast.error(data.error || "Failed to change password");
      } else {
        toast.success("Password changed successfully");
        (e.target as HTMLFormElement).reset();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setChangingPassword(false);
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

      {/* Change Password */}
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
    </div>
  );
}
