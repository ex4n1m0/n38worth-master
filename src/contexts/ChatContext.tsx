"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { getPusherClient } from "@/lib/pusher-client";
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
  recipientId: number | null;
  recipientUsername: string | null;
}

interface ChatContextType {
  messages: ChatMessage[];
  getMessagesForTarget: (targetId: number) => ChatMessage[];
  hasUnread: (targetId: number) => boolean;
  markAsRead: (targetId: number) => void;
  sendMessage: (
    content: string,
    recipientUsername: string
  ) => Promise<ChatMessage | null>;
  unreadPlayers: Set<number>;
}

const ChatContext = createContext<ChatContextType | null>(null);

function getLastReadKey(userId: number, targetId: number): string {
  return `dm-last-read-${userId}-${targetId}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadPlayers, setUnreadPlayers] = useState<Set<number>>(new Set());
  const userId = session?.user?.id ? parseInt(session.user.id) : null;

  // Fetch all messages once on mount
  useEffect(() => {
    if (!userId) return;
    fetch("/api/chat/messages?limit=50")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ChatMessage[]) => setMessages(data))
      .catch(() => {});
  }, [userId]);

  // Single Pusher subscription for all chats
  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const privateChannel = pusher.subscribe(`chat-private-${userId}`);

    const handleNewMessage = (msg: ChatMessage) => {
      if (msg.type === "private" && msg.recipientId === userId) {
        playSound("message");
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Track unread
        setUnreadPlayers((prev) => {
          const next = new Set(prev);
          next.add(msg.sender.id);
          return next;
        });
      } else if (
        msg.type === "private" &&
        msg.sender.id === userId &&
        msg.recipientId
      ) {
        // Own sent message
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    privateChannel.bind("new-message", handleNewMessage);

    return () => {
      privateChannel.unbind("new-message", handleNewMessage);
      pusher.unsubscribe(`chat-private-${userId}`);
    };
  }, [userId]);

  // Check unread on mount for all targets
  useEffect(() => {
    if (!userId || messages.length === 0) return;
    const newUnread = new Set<number>();
    messages.forEach((msg) => {
      if (msg.type === "private" && msg.recipientId === userId) {
        const key = getLastReadKey(userId, msg.sender.id);
        const lastRead = localStorage.getItem(key);
        const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;
        if (new Date(msg.createdAt).getTime() > lastReadTime) {
          newUnread.add(msg.sender.id);
        }
      }
    });
    setUnreadPlayers(newUnread);
  }, [userId, messages]);

  const getMessagesForTarget = useCallback(
    (targetId: number) => {
      if (!userId) return [];
      return messages.filter(
        (m) =>
          m.type === "private" &&
          ((m.sender.id === userId && m.recipientId === targetId) ||
            (m.sender.id === targetId && m.recipientId === userId))
      );
    },
    [userId, messages]
  );

  const hasUnread = useCallback(
    (targetId: number) => {
      return unreadPlayers.has(targetId);
    },
    [unreadPlayers]
  );

  const markAsRead = useCallback(
    (targetId: number) => {
      if (!userId) return;
      const key = getLastReadKey(userId, targetId);
      localStorage.setItem(key, new Date().toISOString());
      setUnreadPlayers((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    },
    [userId]
  );

  const sendMessage = useCallback(
    async (content: string, recipientUsername: string) => {
      try {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content.trim(), recipientUsername }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send");
        if (data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
        return data.message;
      } catch {
        return null;
      }
    },
    []
  );

  return (
    <ChatContext.Provider
      value={{
        messages,
        getMessagesForTarget,
        hasUnread,
        markAsRead,
        sendMessage,
        unreadPlayers,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}