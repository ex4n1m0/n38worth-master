"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { useSound } from "@/hooks/useSound";

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

function getLastReadKey(userId: number, targetId: number): string {
  return `dm-last-read-${userId}-${targetId}`;
}

export function ChatNotificationBell({ className }: { className?: string } = {}) {
  const { data: session } = useSession();
  const { play } = useSound();
  const [unreadCount, setUnreadCount] = useState(0);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;

  // Fetch owned players to check for unread messages
  const { data: player } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Check unread count for all owned players
  const checkUnreadCount = useCallback(
    (messages: ChatMessage[]) => {
      if (!userId || !player?.ownedPlayers) return;

      let count = 0;
      for (const ownedPlayer of player.ownedPlayers) {
        const key = getLastReadKey(userId, ownedPlayer.id);
        const lastRead = localStorage.getItem(key);
        const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;

        const unreadMessages = messages.filter(
          (m) =>
            m.type === "private" &&
            m.sender.id === ownedPlayer.id &&
            m.recipientId === userId &&
            new Date(m.createdAt).getTime() > lastReadTime
        );
        count += unreadMessages.length;
      }
      setUnreadCount(count);
    },
    [userId, player?.ownedPlayers]
  );

  // Mark all messages as read
  const markAllAsRead = useCallback(() => {
    if (!userId || !player?.ownedPlayers) return;

    for (const ownedPlayer of player.ownedPlayers) {
      const key = getLastReadKey(userId, ownedPlayer.id);
      localStorage.setItem(key, new Date().toISOString());
    }
    setUnreadCount(0);
  }, [userId, player?.ownedPlayers]);

  // Subscribe to Pusher for real-time messages
  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const privateChannel = pusher.subscribe(`chat-private-${userId}`);

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.type === "private" && msg.recipientId === userId) {
        // Check if sender is an owned player
        const isOwnedPlayer = player?.ownedPlayers?.some(
          (p: { id: number }) => p.id === msg.sender.id
        );
        if (isOwnedPlayer) {
          setUnreadCount((prev) => prev + 1);
        }
      }
    };

    privateChannel.bind("new-message", handleNewMessage);

    return () => {
      privateChannel.unbind("new-message", handleNewMessage);
      pusher.unsubscribe(`chat-private-${userId}`);
    };
  }, [userId, player?.ownedPlayers]);

  // On mount, check unread from stored messages
  useEffect(() => {
    if (!userId || !player?.ownedPlayers) return;
    fetch("/api/chat/messages?limit=50")
      .then((res) => (res.ok ? res.json() : []))
      .then((messages: ChatMessage[]) => {
        checkUnreadCount(messages);
      })
      .catch(() => {});
  }, [userId, player?.ownedPlayers, checkUnreadCount]);

  if (!session) return null;

  return (
    <Link href="/my-players" onClick={() => { play("buttons"); markAllAsRead(); }} className={className}>
      <Button
        variant="ghost"
        size="sm"
        className={`relative text-gray-400 hover:text-white hover:bg-gray-800 px-2 ${
          unreadCount > 0 ? "animate-pulse" : ""
        }`}
        title={unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}` : "Chat"}
      >
        <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-yellow-400" : ""}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-yellow-500 text-[11px] font-bold text-black flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
    </Link>
  );
}