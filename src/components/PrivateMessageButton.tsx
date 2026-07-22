"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageCircle, Send, Lock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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

function formatTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getLastReadKey(userId: number, targetId: number): string {
  return `dm-last-read-${userId}-${targetId}`;
}

interface PrivateMessageButtonProps {
  targetId: number;
  targetUsername: string;
  targetAvatarUrl?: string | null;
}

export function PrivateMessageButton({
  targetId,
  targetUsername,
  targetAvatarUrl,
}: PrivateMessageButtonProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;
  const { play } = useSound();

  // Mark messages as read (store last read timestamp)
  const markAsRead = useCallback(() => {
    if (!userId) return;
    const key = getLastReadKey(userId, targetId);
    localStorage.setItem(key, new Date().toISOString());
    setHasUnread(false);
  }, [userId, targetId]);

  // Check for unread messages from fetched data
  const checkUnread = useCallback(
    (messages: ChatMessage[]) => {
      if (!userId) return;
      const key = getLastReadKey(userId, targetId);
      const lastRead = localStorage.getItem(key);
      const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;

      // Check if there are messages FROM the target that are newer than lastRead
      const hasNew = messages.some(
        (m) =>
          m.type === "private" &&
          m.sender.id === targetId &&
          m.recipientId === userId &&
          new Date(m.createdAt).getTime() > lastReadTime
      );
      setHasUnread(hasNew);
    },
    [userId, targetId]
  );

  // Fetch all messages (we'll filter to private ones with this user)
  const { data: fetchedMessages } = useQuery({
    queryKey: ["chat-messages"],
    queryFn: async () => {
      const res = await fetch("/api/chat/messages?limit=50");
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json() as Promise<ChatMessage[]>;
    },
    refetchInterval: 150000,
    enabled: open,
  });

  // Filter to private messages between us and this target
  useEffect(() => {
    if (fetchedMessages) {
      const filtered = fetchedMessages.filter(
        (m) =>
          m.type === "private" &&
          ((m.sender.id === userId && m.recipientId === targetId) ||
            (m.sender.id === targetId && m.recipientId === userId))
      );
      setLocalMessages(filtered);
      if (!open) {
        checkUnread(filtered);
      }
    }
  }, [fetchedMessages, userId, targetId, open, checkUnread]);

  // Subscribe to Pusher ALWAYS (not just when dialog is open) to detect incoming DMs
  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    if (!pusher) return;

    const privateChannel = pusher.subscribe(`chat-private-${userId}`);

    const handleNewMessage = (msg: ChatMessage) => {
      if (
        msg.type === "private" &&
        ((msg.sender.id === userId && msg.recipientId === targetId) ||
          (msg.sender.id === targetId && msg.recipientId === userId))
      ) {
        // Add to local messages if dialog is open
        setLocalMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // If the message is from the target and dialog is NOT open, mark as unread
        if (msg.sender.id === targetId) {
          setHasUnread((prev) => {
            // Only set unread if dialog is not currently open
            // We check via a ref-like approach using the current open state
            return true;
          });
        }
      }
    };

    privateChannel.bind("new-message", handleNewMessage);

    return () => {
      privateChannel.unbind("new-message", handleNewMessage);
      pusher.unsubscribe(`chat-private-${userId}`);
    };
  }, [userId, targetId]);

  // When dialog opens, mark as read; when it closes, also mark as read
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        markAsRead();
      } else {
        // Mark as read when closing too (user has seen messages)
        markAsRead();
      }
    },
    [markAsRead]
  );

  // When dialog is open and new messages come in, clear unread
  useEffect(() => {
    if (open) {
      setHasUnread(false);
    }
  }, [open, localMessages]);

  // Auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [localMessages]);

  // On initial mount, check unread from stored messages
  useEffect(() => {
    if (!userId) return;
    // Fetch messages once to check for unread on mount
    fetch("/api/chat/messages?limit=50")
      .then((res) => res.ok ? res.json() : [])
      .then((messages: ChatMessage[]) => {
        checkUnread(messages);
      })
      .catch(() => {});
  }, [userId, checkUnread]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message.trim(),
          recipientUsername: targetUsername,
        }),
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
      toast.error(err.message);
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMutation.mutate();
  };

  const handleClear = () => {
    setLocalMessages([]);
    toast.success("Chat cleared");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            play("buttons");
          }}
          className={
            hasUnread
              ? "border-yellow-500/50 bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 hover:text-yellow-200 text-xs h-7 px-2 animate-pulse"
              : "border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 text-xs h-7 px-2"
          }
          title={
            hasUnread
              ? `New message from ${targetUsername}!`
              : `Message ${targetUsername}`
          }
        >
          <MessageCircle className="h-3 w-3 mr-1" />
          DM
          {hasUnread && (
            <span className="ml-1 h-2 w-2 rounded-full bg-yellow-400 inline-block" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Lock className="h-4 w-4 text-purple-400" />
            DM with {targetUsername}
            <Badge
              variant="secondary"
              className="bg-gray-500/20 text-gray-400 text-[10px] px-1.5 py-0"
            >
              Free
            </Badge>
            {localMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="ml-auto text-gray-400 hover:text-red-400 hover:bg-red-500/10 h-6 px-2"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          className="h-64 overflow-y-auto rounded-lg bg-gray-950/50 border border-gray-800 p-3 space-y-2"
        >
          {localMessages.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              No messages with {targetUsername} yet. Say hello!
            </div>
          )}
          {localMessages.map((msg) => {
            const isOwn = msg.sender.id === userId;
            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
              >
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage
                    src={
                      isOwn
                        ? session?.user?.image || undefined
                        : targetAvatarUrl || undefined
                    }
                  />
                  <AvatarFallback className="bg-gradient-to-br from-purple-600 to-t2-600 text-white text-[9px] font-bold">
                    {(isOwn
                      ? session?.user?.name || "ME"
                      : targetUsername
                    )
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] text-gray-600">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <div
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      isOwn
                        ? "bg-purple-600/30 text-purple-100"
                        : "bg-purple-900/30 text-purple-200"
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

        {/* Input */}
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            placeholder={`Message ${targetUsername}...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={280}
            className="bg-gray-800 border-gray-700 text-white text-sm placeholder:text-gray-500"
          />
          <Button
            type="submit"
            disabled={sendMutation.isPending || !message.trim()}
            className="shrink-0 bg-purple-600 hover:bg-purple-500 text-white"
            size="sm"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
