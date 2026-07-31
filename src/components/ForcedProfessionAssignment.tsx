"use client";

import { useForcedProfessionStore } from "@/hooks/useForcedProfession";
import { AssignProfessionDialog } from "@/components/AssignProfessionDialog";

/**
 * Global forced profession picker: when a GET hires an NPC with no profession,
 * this modal appears immediately and cannot be dismissed until a profession is
 * chosen (the cheapest profession(s) are free on this first assignment, so it
 * is always completable). Processes the queue one card at a time.
 */
export function ForcedProfessionAssignment() {
  const current = useForcedProfessionStore((s) => s.queue[0]);
  const complete = useForcedProfessionStore((s) => s.complete);

  if (!current) return null;

  return (
    <AssignProfessionDialog
      forced
      forcedOpen
      targetId={current.targetId}
      targetUsername={current.targetUsername}
      currentProfession={null}
      onForcedAssigned={complete}
    />
  );
}
