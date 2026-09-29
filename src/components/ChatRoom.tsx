"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Send,
  Globe,
  Loader2,
  CirclePlus,
} from "lucide-react";
import { toast } from "@/lib/event-feed";
import { getPusherClient } from "@/lib/pusher-client";
import Link from "next/link";
import { useSound } from "@/hooks/useSound";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { useLanguage } from "@/components/LanguageContext";

interface ChatMessage {
  id: number;
  content: string;
  type: "public" | "private";
  createdAt: string;
  sender: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
  recipientId: number | null;
  recipientUsername: string | null;
}

function formatTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatRoom() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;
  const { play } = useSound();
  const { ownedIds } = useOwnedPlayerIds();

  // Fetch messages
  const { data: fetchedMessages, isLoading } = useQuery({
    queryKey: ["chat-messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/messages?limit=50");
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json() as Promise<ChatMessage[]>;
    },
    refetchInterval: 150000,
  });

  // Sync fetched messages to local state (public only)
  useEffect(() => {
    if (fetchedMessages) {
      setLocalMessages(fetchedMessages.filter((m) => m.type === "public"));
    }
  }, [fetchedMessages]);

  // Subscribe to Pusher for real-time public messages
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher || !userId) return;

    const publicChannel = pusher.subscribe("chat-public");

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.type !== "public") return;
      // Only ping for other people's messages (own sends already play a sound).
      if (msg.sender.id !== userId) play("chat");
      setLocalMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    publicChannel.bind("new-message", handleNewMessage);

    return () => {
      publicChannel.unbind("new-message", handleNewMessage);
      pusher.unsubscribe("chat-public");
    };
  }, [userId, play]);

  // Auto-scroll to bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [localMessages]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      return data;
    },
    onSuccess: (data) => {
      setMessage("");
      if (data.message) {
        setLocalMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    play("chat");
    sendMutation.mutate();
  };

  return (
    <Card className="border-gray-800 bg-gray-900/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-t1-400" />
            Public Chat
          </CardTitle>
          <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0">
            <CirclePlus className="h-3 w-3 mr-1" />
            +0.1¢/msg
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Messages area */}
        <div ref={messagesContainerRef} className="h-64 overflow-y-auto rounded-lg bg-gray-950/50 border border-gray-800 p-3 space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
          )}
          {!isLoading && localMessages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              No public messages yet. Be the first to chat and earn credits!
            </div>
          )}
          {localMessages.map((msg) => {
            const isOwn = msg.sender.id === userId;
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
              >
                <Link href={`/players/${msg.sender.username}`}>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={getAvatarSrc({
                      avatarUrl: msg.sender.avatarUrl,
                      playerId: msg.sender.id,
                      playerUsername: msg.sender.username,
                      viewerUsername: session?.user?.name,
                      ownedIds,
                    })} />
                    <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-[10px] font-bold">
                      {msg.sender.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div
                  className={`max-w-[75%] ${
                    isOwn ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {!isOwn && (
                      <Link
                        href={`/players/${msg.sender.username}`}
                        className="text-[11px] font-medium text-gray-400 hover:text-t1-400"
                      >
                        {msg.sender.username}
                      </Link>
                    )}
                    <span className="text-[10px] text-gray-600">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <div
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      isOwn
                        ? "bg-t1-600/30 text-t1-100"
                        : "bg-gray-800 text-gray-200"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            placeholder={t.publicMessagePlaceholder}
            aria-label={t.publicMessageAria}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            className="bg-gray-800 border-gray-700 text-white text-sm placeholder:text-gray-500"
          />
          <Button
            type="submit"
            aria-label={t.sendPublicMessageAria}
            disabled={sendMutation.isPending || !message.trim()}
            className="shrink-0 bg-green-600 hover:bg-green-500 text-white"
            size="sm"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-3.5 w-3.5 mr-1" />
                +0.1¢
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
