"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useSound } from "@/hooks/useSound";

const PREFIX = "n38worth_coach_";

function wasSeen(id: string): boolean {
  if (typeof window === "undefined") return true;
  return !!localStorage.getItem(PREFIX + id);
}

/**
 * One-time contextual tip, shown exactly once per `id` (localStorage-flagged)
 * and dismissed with the X. Use for "first visit" explanations on key UI
 * elements — credits, hiring, missions.
 */
export function CoachMark({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const { play } = useSound();

  useEffect(() => {
    if (!wasSeen(id)) setShow(true);
  }, [id]);

  if (!show) return null;

  const dismiss = () => {
    play("close");
    localStorage.setItem(PREFIX + id, "1");
    setShow(false);
  };

  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/70 px-3 py-2 text-xs text-cyan-100 ${className ?? ""}`}
    >
      <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-cyan-300" />
      <span className="flex-1 leading-snug">{children}</span>
      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 rounded text-cyan-300 hover:text-white transition-colors"
        aria-label="Dismiss tip"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
