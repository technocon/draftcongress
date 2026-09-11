import { withTenant } from "@/server/db/tenant-client";
import { resolveExpiredPicks } from "./auto-pick";

/**
 * Reads current draft state, lazily resolving any overdue pick first (SRD
 * B2's fallback — see auto-pick.ts's doc comment). The client-side roster
 * tracker polls this every ~2-3s while a draft is in_progress (SRD B5's
 * <500ms target is a computation-latency bound on this query, not a push
 * guarantee — see the architecture plan §5 for why: no websocket infra in
 * Phase 1/on Hostinger's Node.js hosting).
 */
export async function getDraftState(tenantId: string, draftEventId: string) {
  await resolveExpiredPicks(tenantId, draftEventId);

  return withTenant(tenantId, (tx) =>
    tx.draftEvent.findUniqueOrThrow({
      where: { id: draftEventId },
      include: {
        picks: { orderBy: { pickNumber: "asc" }, include: { bloc: true, owner: { select: { id: true, name: true } } } },
        season: { include: { league: true } },
      },
    })
  );
}
