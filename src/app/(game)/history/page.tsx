"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History,
  ShoppingCart,
  DollarSign,
  UserX,
  Trash2,
  Loader2,
  Filter,
} from "lucide-react";
import { redirect } from "next/navigation";
import { useLanguage } from "@/components/LanguageContext";
import { useState } from "react";
import { formatCompact, navbarBtnStyle } from "@/lib/utils";

const eventTypeConfig = {
  purchase: {
    icon: ShoppingCart,
    label: "Purchase",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  sell: {
    icon: DollarSign,
    label: "Sell",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/20",
  },
  npc_deletion: {
    icon: Trash2,
    label: "NPC Deletion",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  player_deletion: {
    icon: UserX,
    label: "Player Deletion",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
};

export default function GameHistoryPage() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const [filter, setFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["game-history", filter],
    queryFn: async () => {
      const url = filter 
        ? `/api/game-history?type=${filter}` 
        : "/api/game-history";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch game history");
      return res.json();
    },
    enabled: !!session,
  });

  if (status === "unauthenticated") {
    redirect("/login");
  }

  const filters = [
    { value: null, label: "All Events" },
    { value: "purchase", label: "Hires" },
    { value: "sell", label: "Fires" },
    { value: "npc_deletion", label: "NPC Deletions" },
    { value: "player_deletion", label: "Player Deletions" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <History className="h-8 w-8 text-t2-400" />
          Game History
        </h1>
        <p className="text-gray-400 mt-1">
          Complete log of all game events including purchases, sells, and deletions
        </p>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.value ?? "all"}
            variant="ghost"
            size="sm"
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Filter className="h-3 w-3 mr-1" />
            {f.label}
          </Button>
        ))}
      </div>

      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white">
            {filter ? eventTypeConfig[filter as keyof typeof eventTypeConfig]?.label ?? "History" : "All Events"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
            </div>
          ) : data?.history?.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No history events found</p>
              <p className="text-sm mt-1">
                Game events will appear here as they occur
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.history?.map(
                (event: {
                  id: number;
                  eventType: string;
                  actorId: number | null;
                  targetId: number | null;
                  targetUsername: string | null;
                  actorUsername: string | null;
                  actorAvatarUrl: string | null;
                  details: { amount?: number; [key: string]: unknown } | null;
                  createdAt: string;
                }) => {
                  const config = eventTypeConfig[event.eventType as keyof typeof eventTypeConfig] ?? {
                    icon: History,
                    label: event.eventType,
                    color: "text-gray-400",
                    bgColor: "bg-gray-500/10",
                    borderColor: "border-gray-500/20",
                  };
                  const Icon = config.icon;

                  return (
                    <div
                      key={event.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg bg-gray-800/50"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg ${config.bgColor} flex-shrink-0`}>
                          <Icon className={`h-5 w-5 ${config.color}`} />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {event.actorUsername && (
                              <>
                                <Avatar className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                                  <AvatarImage
                                    src={event.actorAvatarUrl || undefined}
                                  />
                                  <AvatarFallback className="bg-gray-700 text-white text-xs">
                                    {event.actorUsername.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm text-white font-medium truncate">
                                  {event.actorUsername}
                                </span>
                              </>
                            )}
                            
                            <span className="text-sm text-gray-400 flex-shrink-0">
                              {event.eventType === "purchase" && "hired"}
                              {event.eventType === "sell" && "fired"}
                              {event.eventType === "npc_deletion" && "deleted NPC"}
                              {event.eventType === "player_deletion" && "deleted player"}
                            </span>

                            {event.targetUsername && (
                              <span className="text-sm text-white font-medium truncate">
                                {event.targetUsername}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {event.details?.amount && (
                              <Badge
                                variant="secondary"
                                className={`font-mono text-xs ${config.bgColor} ${config.color} ${config.borderColor}`}
                              >
                                {formatCompact(event.details.amount)}¢
                              </Badge>
                            )}
                            <Badge
                              variant="secondary"
                              className={`text-xs ${config.bgColor} ${config.color} ${config.borderColor}`}
                            >
                              {config.label}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <span className="text-xs text-gray-500 sm:text-right sm:w-28 flex-shrink-0">
                        {new Date(event.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
