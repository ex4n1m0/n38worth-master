"use client";

import { useQuery } from "@tanstack/react-query";
import { useSessionCompat as useSession } from "@/lib/session-compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  History,
  ShoppingCart,
  DollarSign,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { redirect } from "next/navigation";
import { useLanguage } from "@/components/LanguageContext";
import { formatCompact } from "@/lib/utils";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrcByUsername } from "@/lib/avatar-utils";

export default function TransactionsPage() {
  const { data: session, status } = useSession();
  const { t } = useLanguage();
  const { ownedUsernames } = useOwnedPlayerIds();
  const viewerUsername = session?.user?.name;

  const { data, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const res = await fetch("/api/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!session,
  });

  if (status === "unauthenticated") {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <History className="h-8 w-8 text-t2-400" />
          {t.transactionHistory}
        </h1>
        <p className="text-gray-400 mt-1">
          {t.transactionHistory}
        </p>
      </div>

      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white">{t.transactionHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
            </div>
          ) : data?.transactions?.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t.noTransactions}</p>
              <p className="text-sm mt-1">
                {t.noTransactions}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.transactions?.map(
                (txn: {
                  id: number;
                  type: string;
                  amount: number;
                  createdAt: string;
                  isInitiator: boolean;
                  buyer: { username: string; avatarUrl: string | null };
                  target: { username: string; avatarUrl: string | null };
                }) => (
                  <div
                    key={txn.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-gray-800/50"
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        txn.type === "purchase"
                          ? "bg-t1-500/10"
                          : "bg-t2-500/10"
                      }`}
                    >
                      {txn.type === "purchase" ? (
                        <ShoppingCart
                          className={`h-5 w-5 ${
                            txn.isInitiator
                              ? "text-t1-400"
                              : "text-t2-400"
                          }`}
                        />
                      ) : (
                        <DollarSign className="h-5 w-5 text-t2-400" />
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Avatar className="h-40 w-40">
                        <AvatarImage
                          src={getAvatarSrcByUsername({
                            avatarUrl: txn.buyer.avatarUrl,
                            playerUsername: txn.buyer.username,
                            viewerUsername,
                            ownedUsernames,
                          })}
                        />
                        <AvatarFallback className="bg-gray-700 text-white text-xs">
                          {txn.buyer.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-white font-medium truncate">
                        {txn.buyer.username}
                      </span>
                      <ArrowRight className="h-3 w-3 text-gray-600 flex-shrink-0" />
                      <Avatar className="h-40 w-40">
                        <AvatarImage
                          src={getAvatarSrcByUsername({
                            avatarUrl: txn.target.avatarUrl,
                            playerUsername: txn.target.username,
                            viewerUsername,
                            ownedUsernames,
                          })}
                        />
                        <AvatarFallback className="bg-gray-700 text-white text-xs">
                          {txn.target.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-white font-medium truncate">
                        {txn.target.username}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge
                        variant="secondary"
                        className={`font-mono ${
                          txn.type === "purchase"
                            ? txn.isInitiator
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-t1-500/10 text-t1-400 border-t1-500/20"
                            : "bg-t1-500/10 text-t1-400 border-t1-500/20"
                        }`}
                      >
                        {txn.type === "purchase" ? (txn.isInitiator ? "-" : "+") : (txn.isInitiator ? "+" : "")}
                        {formatCompact(txn.amount)}¢
                      </Badge>
                      <span className="text-xs text-gray-500 w-20 text-right">
                        {new Date(txn.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
