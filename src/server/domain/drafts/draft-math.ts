import type { TenantScopedClient } from "@/server/db/tenant-client";

/**
 * Total DraftPicks needed to complete a draft event: rosterSize x
 * ownerCount, MINUS any blocs a keeper league already carried over into
 * this season's rosters before the draft started (see
 * ../leagues/start-season.ts). Kept RosterBloc rows never get a
 * draftPickId, so `draftPickId: null` reliably identifies them and this
 * count is invariant for the life of the draft (kept blocs are all
 * created before startDraft runs; every row the draft itself creates has
 * a draftPickId). Recomputed at each call site rather than stored on
 * DraftEvent, since it only ever needs three inputs already on hand.
 */
export async function computeTotalPicks(
  tx: TenantScopedClient,
  seasonId: string,
  rosterSize: number,
  ownerCount: number
): Promise<number> {
  const keptCount = await tx.rosterBloc.count({ where: { seasonId, draftPickId: null } });
  return rosterSize * ownerCount - keptCount;
}
