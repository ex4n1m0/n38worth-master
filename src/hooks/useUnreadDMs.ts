"use client";

import { useCallback } from "react";
import { useChat } from "@/contexts/ChatContext";

export function useUnreadDMs(targetId: number) {
  const { hasUnread, markAsRead } = useChat();

  const hasUnreadMessages = hasUnread(targetId);

  const markMessagesAsRead = useCallback(() => {
    markAsRead(targetId);
  }, [markAsRead, targetId]);

  return { hasUnread: hasUnreadMessages, markAsRead: markMessagesAsRead };
}