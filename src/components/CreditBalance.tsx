"use client";

import { useCredits } from "@/hooks/useCredits";
import { Coins, Loader2 } from "lucide-react";
import { formatCompact, getDynamicNavFontSize } from "@/lib/utils";

export function CreditBalance() {
  const { data: credits, isLoading } = useCredits();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-t1-500/10 border border-t1-500/20">
      <Coins className="h-4 w-4 text-t1-400" />
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin text-t1-400" />
      ) : (
        <span className={`font-mono font-semibold text-t1-400 ${getDynamicNavFontSize(credits ?? 0)}`}>
          {formatCompact(Number((credits ?? 0).toFixed(2)))}¢
        </span>
      )}
    </div>
  );
}
