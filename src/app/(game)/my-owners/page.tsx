"use client";

import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function MyOwnersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.name) {
      router.replace(`/player?u=${session.user.name}`);
    }
  }, [session, status, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
    </div>
  );
}
