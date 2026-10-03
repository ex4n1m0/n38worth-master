"use client";

/**
 * Autopilot navbar chip — status at a glance:
 *   gray    AI off (click → settings)
 *   cyan    ARMED, running turns
 *   amber   copilot plan awaiting approval (approve/dismiss inline)
 * Hidden entirely while the feature flag is off.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, Loader2, Settings2, X, Zap } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useAutopilotEnabled } from "@/hooks/useAutopilot";
import { autopilotReady, useAutopilotStore } from "@/lib/autopilot/store";
import { approveAwaitingPlan, AUTOPILOT_INVALIDATE_KEYS } from "@/lib/autopilot/loop";
import { toast } from "@/lib/event-feed";

export function AutopilotChip() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { play } = useSound();
  const queryClient = useQueryClient();
  const { autopilotEnabled } = useAutopilotEnabled();

  const armed = useAutopilotStore((s) => s.armed);
  const running = useAutopilotStore((s) => s.running);
  const awaiting = useAutopilotStore((s) => s.awaiting);
  const setArmed = useAutopilotStore((s) => s.setArmed);
  const setAwaiting = useAutopilotStore((s) => s.setAwaiting);

  const [approving, setApproving] = useState(false);

  if (!autopilotEnabled) return null;

  const username = session?.user?.name ?? "";

  async function approve() {
    if (!username) return;
    setApproving(true);
    try {
      await approveAwaitingPlan(username, {
        onAction: () => {
          for (const key of AUTOPILOT_INVALIDATE_KEYS) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        },
      });
      play("confirm");
    } finally {
      setApproving(false);
    }
  }

  function toggleArm() {
    if (!armed && !autopilotReady()) {
      toast.error(t.apErrorNoKey);
      play("error");
      return;
    }
    setArmed(!armed);
    play("toggle");
  }

  const label = awaiting
    ? t.apChipAwaiting
    : running
      ? t.apChipRunning
      : armed
        ? t.apChipArmed
        : t.apChipOff;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t.apChipTitle}
          aria-label={t.apChipTitle}
          className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 h-8 text-[11px] font-bold tracking-wide transition-colors ${
            awaiting
              ? "border-amber-500/60 bg-amber-950/40 text-amber-300 animate-pulse"
              : armed
                ? "border-cyan-500/60 bg-cyan-950/40 text-cyan-300"
                : "border-gray-700 bg-gray-900/60 text-gray-500 hover:text-gray-300"
          }`}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-gray-900 border-gray-800">
        <div className="px-2 py-1.5 space-y-2">
          <p className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-cyan-400" />
            {t.apChipTitle} · {label}
          </p>

          {awaiting && (
            <div className="space-y-1.5 rounded border border-amber-500/30 bg-amber-950/20 p-2">
              <p className="text-[11px] text-amber-200 font-mono break-words">
                {t.apAwaitingDigest.replace("{digest}", awaiting.digest)}
              </p>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={approve}
                  disabled={approving}
                  className="h-7 px-2 text-[11px] bg-amber-600 hover:bg-amber-500 text-white"
                >
                  {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {t.apApprove}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAwaiting(null)}
                  className="h-7 px-2 text-[11px] border-gray-700"
                >
                  <X className="h-3 w-3" />
                  {t.apDismiss}
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={toggleArm}
              className={`h-7 px-2 text-[11px] ${
                armed
                  ? "border-red-500/40 bg-red-950/30 text-red-300 hover:text-red-200"
                  : "border-cyan-500/40 bg-cyan-950/30 text-cyan-300 hover:text-cyan-200"
              }`}
            >
              {armed ? t.apDisarm : t.apArm}
            </Button>
            <Link href="/settings">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] border-gray-700 text-gray-300"
              >
                <Settings2 className="h-3 w-3" />
                {t.apSettingsLink}
              </Button>
            </Link>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
