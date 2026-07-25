"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Send, Loader2, LogIn, ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { getPusherClient } from "@/lib/pusher-client";
import Link from "next/link";
import { ChatProvider, useChat } from "@/contexts/ChatContext";
import { InlineDMChat } from "@/components/InlineDMChat";
import { isAIPlayerUsername } from "@/lib/agent/roster";
import { playSound } from "@/hooks/useSound";

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
}

interface HumanPlayer {
  id: number;
  username: string;
  avatarUrl: string | null;
  lastOnlineAt: string | null;
}

function formatTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function GlobalChatInner({ embedded = false }: { embedded?: boolean }) {
  const { data: session, status } = useSession();
  const [message, setMessage] = useState("");
  const [realtimeMessages, setRealtimeMessages] = useState<ChatMessage[]>([]);
  const [agentTyping, setAgentTyping] = useState(false);
  const [activeDM, setActiveDM] = useState<HumanPlayer | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;
  const { unreadPlayers } = useChat();

  // Create a demo account and sign in — lets logged-out visitors start typing.
  const handleGuestPlay = async () => {
    setGuestLoading(true);
    try {
      const res = await fetch("/api/demo-register", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to create guest account");
      await signIn("credentials", {
        username: d.username,
        password: d.password,
        redirect: false,
      });
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create guest account");
      setGuestLoading(false);
    }
  };

  const { data: humanPlayers = [] } = useQuery<HumanPlayer[]>({
    queryKey: ["chat-human-players"],
    queryFn: async () => {
      const res = await fetch("/api/players/chat-list");
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    refetchInterval: 600 * 1000,
    staleTime: 60 * 1000,
  });

  const { data: fetchedMessages, isLoading } = useQuery({
    queryKey: ["public-chat-messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/public-messages?limit=50");
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json() as Promise<ChatMessage[]>;
    },
    // No refetchInterval — Pusher provides real-time updates.
    staleTime: Infinity,
  });

  // Merge fetched + real-time, deduplicating by id
  const fetchedIds = new Set((fetchedMessages ?? []).map((m) => m.id));
  const localMessages = [
    ...(fetchedMessages ?? []),
    ...realtimeMessages.filter((m) => !fetchedIds.has(m.id)),
  ];

  // Pusher real-time — public channel requires no auth
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe("chat-public");

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.type !== "public") return;
      // Hide the typing indicator when any AI player's (AGI or goddess) message arrives.
      if (isAIPlayerUsername(msg.sender.username)) {
        setAgentTyping(false);
      }
      // Only ping for other people's messages (own sends already play a sound).
      if (msg.sender.id !== userId) playSound("chat");
      setRealtimeMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleAgentTyping = (data: unknown) => {
      console.log("[chat] agent-typing event received", data);
      setAgentTyping(true);
      // Safety: auto-hide after 10s in case the LLM call fails silently
      setTimeout(() => setAgentTyping(false), 10000);
    };

    channel.bind("new-message", handleNewMessage);
    channel.bind("agent-typing", handleAgentTyping);

    return () => {
      channel.unbind("new-message", handleNewMessage);
      channel.unbind("agent-typing", handleAgentTyping);
      pusher.unsubscribe("chat-public");
    };
  }, [userId]);

  // Auto-scroll to bottom (only for public chat)
  useEffect(() => {
    if (activeDM) return;
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [localMessages.length, activeDM, agentTyping]);

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
        setRealtimeMessages((prev: ChatMessage[]) => {
          if (prev.some((m: ChatMessage) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    },
    onError: (err: Error) => {
      playSound("error");
      toast.error(err.message);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    playSound("chat");
    sendMutation.mutate();
  };

  return (
    <div
      className={
        embedded
          ? "flex flex-col rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden h-[70vh]"
          : "min-h-screen bg-gradient-to-b from-gray-950 via-gray-950 to-black flex flex-col"
      }
    >
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/70 backdrop-blur-md px-4 py-4 shrink-0 sticky top-0 z-20">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-t1-600 to-t2-600 shadow-[0_0_20px_var(--t1-600)]">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Global Chat</h1>
              <p className="text-gray-400 text-xs flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                Public room · everyone can read
              </p>
            </div>
          </div>
          {!embedded && (
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-gray-300 hover:text-white hover:border-gray-600 text-sm transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
          )}
        </div>
      </div>

      {/* Body: two-column */}
      <div className="flex-1 overflow-hidden flex w-full gap-4 px-4 py-4">

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeDM ? (
            <div className="flex flex-col h-full">
              <button
                onClick={() => setActiveDM(null)}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-3 transition-colors self-start"
              >
                <ArrowLeft className="h-4 w-4" />
                Public Chat
              </button>
              <div className="flex-1" style={{ minHeight: 0 }}>
                <InlineDMChat
                  targetId={activeDM.id}
                  targetUsername={activeDM.username}
                  targetAvatarUrl={activeDM.avatarUrl}
                />
              </div>
            </div>
          ) : (
          <>
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto rounded-xl bg-gray-900/60 border border-gray-800 p-4 space-y-3 min-h-0"
          style={embedded ? undefined : { maxHeight: "calc(100vh - 220px)" }}
        >
          {isLoading && (
            <div className="flex items-center justify-center h-full py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          )}
          {!isLoading && localMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-gray-500 text-sm gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/60">
                <MessageCircle className="h-7 w-7 text-gray-600" />
              </div>
              <p>No messages yet. Be the first to say hello!</p>
            </div>
          )}
          {localMessages.map((msg, i) => {
            const isOwn = msg.sender.id === userId;
            const prevMsg = localMessages[i - 1];
            const showDate =
              !prevMsg ||
              new Date(msg.createdAt).toDateString() !==
                new Date(prevMsg.createdAt).toDateString();

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-gray-800" />
                    <span className="text-gray-600 text-[10px]">
                      {formatDate(msg.createdAt)}
                    </span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>
                )}
                <div className={`flex gap-2.5 animate-chat-msg-in ${isOwn ? "flex-row-reverse" : ""}`}>
                  <Link href={`/players/${msg.sender.username}`} className="shrink-0">
                    <Avatar className="h-8 w-8 ring-1 ring-gray-700/50">
                      <AvatarImage src={msg.sender.avatarUrl || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-[10px] font-bold">
                        {msg.sender.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className={`max-w-[78%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`flex items-center gap-1.5 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                      {!isOwn && (
                        <Link
                          href={`/players/${msg.sender.username}`}
                          className="text-[11px] font-semibold text-gray-300 hover:text-t1-400 transition-colors"
                        >
                          {msg.sender.username}
                        </Link>
                      )}
                      <span className="text-[10px] text-gray-600">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm break-words ${
                        isOwn
                          ? "bg-gradient-to-br from-t1-600/50 to-t2-600/40 text-t1-100 rounded-tr-sm"
                          : "bg-gray-800/90 text-gray-200 rounded-tl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {agentTyping && (
            <div className="flex gap-2.5">
              <Avatar className="h-8 w-8 ring-1 ring-gray-700/50 shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-[10px] font-bold">
                  AG
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-semibold text-gray-300 mb-0.5">AGI is typing</span>
                <div className="rounded-2xl rounded-tl-sm bg-gray-800/90 px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Send form or CTA */}
        <div className="mt-3 shrink-0">
          {status === "loading" ? null : session ? (
            <form onSubmit={handleSend} className="flex gap-2">
              <Input
                placeholder="Send a message to the world..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={280}
                className="bg-gray-800/80 border-gray-700 text-white text-sm placeholder:text-gray-500 flex-1 rounded-full focus-visible:ring-t1-500"
                autoFocus
              />
              <Button
                type="submit"
                disabled={sendMutation.isPending || !message.trim()}
                className="shrink-0 rounded-full bg-gradient-to-r from-t1-600 to-t2-600 hover:brightness-110 text-white px-5"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
              <p className="text-gray-400 text-sm">
                <span className="text-white font-medium">Sign in</span> to join the conversation
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleGuestPlay}
                  disabled={guestLoading}
                  className="bg-green-600/20 border border-green-500/40 text-green-300 hover:bg-green-600/30 gap-1.5"
                >
                  {guestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Try as Guest"}
                </Button>
                <Link href="/register">
                  <Button size="sm" className="bg-t1-600 hover:bg-t1-500 text-white gap-1.5">
                    <LogIn className="h-3.5 w-3.5" />
                    Join
                  </Button>
                </Link>
              </div>
            </div>
          )}
          <p className="text-center text-gray-700 text-[10px] mt-2">
            Messages are public · be respectful
          </p>
        </div>
        </>
        )}
        </div>

        {/* Right sidebar: human players (only for authenticated users —
            clicking a player opens a DM, which requires login). */}
        {session && (
        <div className="hidden lg:flex flex-col w-64 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-gray-500" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Players</span>
            {humanPlayers.length > 0 && (
              <span className="text-[10px] text-gray-600 ml-auto">{humanPlayers.length}</span>
            )}
          </div>
          <div
            className="flex-1 overflow-y-auto rounded-xl bg-gray-900/60 border border-gray-800 divide-y divide-gray-800/60"
          >
            {humanPlayers.length === 0 && (
              <div className="flex items-center justify-center py-8 text-gray-600 text-xs">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </div>
            )}
            {humanPlayers.map((player) => {
              const isActive = activeDM?.id === player.id;
              const hasUnread = unreadPlayers.has(player.id);
              return (
                <button
                  key={player.id}
                  onClick={() => setActiveDM(isActive ? null : player)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-800/60 ${
                    isActive ? "bg-gray-800/80 border-l-2 border-t1-400" : ""
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-7 w-7 ring-1 ring-gray-700/50">
                      <AvatarImage src={player.avatarUrl || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-[9px] font-bold">
                        {player.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse border border-gray-900" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${
                      isActive ? "text-t1-300" : "text-gray-200"
                    }`}>
                      {player.username}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {formatRelativeTime(player.lastOnlineAt)}
                    </p>
                  </div>
                  {hasUnread && !isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

      </div>
    </div>
  );
}

export function GlobalChatPage({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <ChatProvider>
      <GlobalChatInner embedded={embedded} />
    </ChatProvider>
  );
}
