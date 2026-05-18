"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function formatSlotCost(cost: number): string {
  if (cost >= 1_000_000) return `${(cost / 1_000_000).toFixed(1).replace(/\.0$/, "")}M¢`;
  if (cost >= 1000) return `${Math.round(cost / 1000)}k¢`;
  return `${cost}¢`;
}

interface OwnershipLimitData {
  limit: number;
  currentOwned: number;
  canBuyMore: boolean;
  nextSlotCost: number;
}

export function OwnershipLimit({ hideButton }: { hideButton?: boolean } = {}) {
  const [data, setData] = useState<OwnershipLimitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const queryClient = useQueryClient();

  async function fetchOwnershipLimit() {
    try {
      const response = await fetch("/api/settings/ownership-limit");
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch ownership limit:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOwnershipLimit();
    const interval = setInterval(fetchOwnershipLimit, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleBuySlots() {
    if (buying) return;
    setBuying(true);
    try {
      const res = await fetch("/api/game/buy-hire-slots", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to buy slots");
        return;
      }
      toast.success(`+10 slots purchased! New limit: ${result.newLimit}`);
      await fetchOwnershipLimit();
      await queryClient.invalidateQueries({ queryKey: ["credits"] });
    } catch {
      toast.error("Failed to buy slots");
    } finally {
      setBuying(false);
    }
  }

  if (loading || !data) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-800/50 border border-gray-700/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2">
        <Users className="h-6 w-6 text-gray-400" />
        <span className="text-lg font-bold">
          <span className={data.canBuyMore ? "text-green-400" : "text-red-400"}>
            {data.currentOwned}
          </span>
          <span className="text-gray-500">/</span>
          <span className="text-gray-300">{data.limit}</span>
        </span>
      </div>
      {!hideButton && (
        <button
          onClick={handleBuySlots}
          disabled={buying}
          title={`+10 slots for ${(data.nextSlotCost ?? 1000).toLocaleString()}¢`}
          className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 border-l border-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span>{formatSlotCost(data.nextSlotCost)}</span>
        </button>
      )}
    </div>
  );
}

export function BuySlotsButton() {
  const [data, setData] = useState<OwnershipLimitData | null>(null);
  const [buying, setBuying] = useState(false);
  const queryClient = useQueryClient();

  async function fetchData() {
    try {
      const res = await fetch("/api/settings/ownership-limit");
      if (res.ok) setData(await res.json());
    } catch {}
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleBuy() {
    if (buying || !data) return;
    setBuying(true);
    try {
      const res = await fetch("/api/game/buy-hire-slots", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to buy slots");
        return;
      }
      toast.success(`+10 slots purchased! New limit: ${result.newLimit}`);
      await fetchData();
      await queryClient.invalidateQueries({ queryKey: ["credits"] });
    } catch {
      toast.error("Failed to buy slots");
    } finally {
      setBuying(false);
    }
  }

  if (!data) return null;

  return (
    <button
      onClick={handleBuy}
      disabled={buying}
      title={`+10 hire slots for ${(data.nextSlotCost ?? 1000).toLocaleString()}¢`}
      className="flex flex-row items-center justify-center gap-1 w-full h-full font-bold text-white drop-shadow-lg hover:brightness-125 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ backgroundImage: "url('/navbar.png')", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}
    >
      {buying ? (
        <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
      ) : (
        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
      )}
      <span className="text-xs sm:text-sm leading-none">{formatSlotCost(data.nextSlotCost)}</span>
      <span className="text-[10px] sm:text-xs text-amber-300 leading-none">+10 slots</span>
    </button>
  );
}