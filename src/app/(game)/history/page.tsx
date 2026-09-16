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
  Rocket,
  Loader2,
  Filter,
} from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageContext";
import { HallOfChampions } from "@/components/HallOfChampions";
import { useState } from "react";
import { formatCompact } from "@/lib/utils";

const eventTypeConfig = {
  purchase: {
    icon: ShoppingCart,
    label: "Get",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
  pump: {
    icon: Rocket,
    label: "Overclock",
    color: "text-fuchsia-400",
    bgColor: "bg-fuchsia-500/10",
    borderColor: "border-fuchsia-500/20",
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
    { value: null, label: "ALL" },
    { value: "purchase", label: "GETS" },
    { value: "pump", label: "OVERCLOCKS" },
  ];

  return (
    <div className="space-y-6">
      {/* Past game winners — at the very top of the History page. */}
      <HallOfChampions />

      <div className="pt-4 border-t border-white/10">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <History className="h-8 w-8 text-t2-400" />
          Game History
        </h1>
        <p className="text-gray-400 mt-1">
          Complete log of all game events including hires, overclocks, sells, and deletions
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
                ? "rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-cyan-300 font-semibold hover:bg-cyan-500/15 hover:text-cyan-200"
                : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
            }
          >
            <Filter className="h-3 w-3 mr-1" />
            {f.label}
          </Button>
        ))}
      </div>

      <Card className="border-gray-800 bg-transparent">
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
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg"
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
                                <Link
                                  href={`/players/${event.actorUsername}`}
                                  className="text-sm text-white font-medium truncate hover:text-t1-400 hover:underline transition-colors"
                                >
                                  {event.actorUsername}
                                </Link>
                              </>
                            )}
                            
                            <span className="text-sm text-gray-400 flex-shrink-0">
                              {event.eventType === "purchase" && "got"}
                              {event.eventType === "pump" && "overclocked"}
                              {event.eventType === "sell" && "fired"}
                              {event.eventType === "npc_deletion" && "deleted NPC"}
                              {event.eventType === "player_deletion" && "deleted player"}
                            </span>

                            {event.targetUsername && (
                              <Link
                                href={`/players/${event.targetUsername}`}
                                className="text-sm text-white font-medium truncate hover:text-t1-400 hover:underline transition-colors"
                              >
                                {event.targetUsername}
                              </Link>
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
