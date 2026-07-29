"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Lock, Loader2 } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { useChat } from "@/contexts/ChatContext";
import { playSound } from "@/hooks/useSound";

function formatTime(date: string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface InlineDMChatProps {
  targetId: number;
  targetUsername: string;
  targetAvatarUrl?: string | null;
}

export function InlineDMChat({
  targetId,
  targetUsername,
  targetAvatarUrl,
}: InlineDMChatProps) {
  const { data: session } = useSession();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;

  // Use shared chat context instead of local state
  const { getMessagesForTarget, hasUnread, markAsRead, sendMessage } =
    useChat();

  const localMessages = getMessagesForTarget(targetId);
  const hasUnreadMessages = hasUnread(targetId);

  // Auto-scroll when messages change
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [localMessages]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      const result = await sendMessage(message.trim(), targetUsername);
      if (!result) throw new Error("Failed to send");
      return result;
    },
    onSuccess: () => {
      setMessage("");
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
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-800 mb-2">
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarImage src={targetAvatarUrl || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-purple-600 to-t2-600 text-white text-[9px] font-bold">
            {targetUsername.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-1.5 min-w-0">
          <Lock className="h-3 w-3 text-purple-400 shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {targetUsername}
          </span>
          <Badge
            variant="secondary"
            className="bg-gray-500/20 text-gray-400 text-[9px] px-1 py-0 shrink-0"
          >
            Free
          </Badge>
          {hasUnreadMessages && (
            <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto rounded-lg border border-gray-800 p-2 space-y-1.5 h-[280px] max-h-[280px]"
      >
        {localMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
            No messages yet. Say hello!
          </div>
        )}
        {localMessages.map((msg) => {
          const isOwn = msg.sender.id === userId;
          return (
            <div
              key={msg.id}
              className={`flex gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}
            >
              <Avatar className="h-5 w-5 shrink-0 mt-0.5">
                <AvatarImage
                  src={
                    isOwn
                      ? session?.user?.image || undefined
                      : targetAvatarUrl || undefined
                  }
                />
                <AvatarFallback className="bg-gradient-to-br from-purple-600 to-t2-600 text-white text-[8px] font-bold">
                  {(isOwn ? session?.user?.name || "ME" : targetUsername)
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div
                className={`max-w-[80%] ${isOwn ? "items-end" : "items-start"}`}
              >
                <span className="text-[9px] text-gray-600 block mb-0.5">
                  {formatTime(msg.createdAt)}
                </span>
                <div
                  className={`rounded-lg px-2.5 py-1 text-xs ${
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
      <form onSubmit={handleSend} className="flex gap-1.5 mt-2">
        <Input
          placeholder={`Message ${targetUsername}...`}
          aria-label={`Message ${targetUsername}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          className="bg-gray-800 border-gray-700 text-white text-xs placeholder:text-gray-500 h-8"
        />
        <Button
          type="submit"
          aria-label={`Send message to ${targetUsername}`}
          disabled={sendMutation.isPending || !message.trim()}
          className="shrink-0 bg-purple-600 hover:bg-purple-500 text-white h-8 px-2"
          size="sm"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </Button>
      </form>
    </div>
  );
}