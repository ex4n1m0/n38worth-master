"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function RanksPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/my-profile");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
    </div>
  );
}
