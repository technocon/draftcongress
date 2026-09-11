import type { DraftEvent } from "@prisma/client";
import type { TenantScopedClient } from "@/server/db/tenant-client";
import { DraftError } from "./errors";

/**
 * Shared transactional core for both a user-submitted pick
 * (./submit-pick.ts) and an auto-pick (./auto-pick.ts): create the
 * DraftPick + RosterBloc, then advance (or complete) the draft clock.
 * Must run inside the caller's own withTenant transaction — `tx` is that
 * transaction, not a fresh one.
 */
export async function recordPick(
  tx: TenantScopedClient,
  draftEvent: DraftEvent,
  totalPicks: number,
  rosterId: string,
  ownerUserId: string,
  blocId: string,
  isAutoPick: boolean
) {
  const pickNumber = draftEvent.currentPickIndex + 1;

  let draftPick;
  try {
    draftPick = await tx.draftPick.create({
      data: {
        tenantId: draftEvent.tenantId,
        draftEventId: draftEvent.id,
        rosterId,
        ownerUserId,
        blocId,
        pickNumber,
        isAutoPick,
      },
    });
    await tx.rosterBloc.create({
      data: {
        tenantId: draftEvent.tenantId,
        rosterId,
        seasonId: draftEvent.seasonId,
        blocId,
        draftPickId: draftPick.id,
      },
    });
  } catch {
    // The unique constraint on RosterBloc(seasonId, blocId) is the real
    // scarcity backstop (SRD open question #5) — this catches a lost race
    // against a concurrent pick for the same bloc.
    throw new DraftError("This bloc was just claimed by another owner — pick again");
  }

  const pickOrder = draftEvent.pickOrder as string[];
  const nextIndex = pickNumber;

  if (nextIndex >= totalPicks) {
    await tx.draftEvent.update({
      where: { id: draftEvent.id },
      data: {
        status: "complete",
        currentPickIndex: nextIndex,
        currentPickerUserId: null,
        currentPickDeadlineAt: null,
      },
    });
    await tx.season.update({ where: { id: draftEvent.seasonId }, data: { status: "active" } });
  } else {
    const nextPicker = pickOrder[nextIndex % pickOrder.length];
    await tx.draftEvent.update({
      where: { id: draftEvent.id },
      data: {
        currentPickIndex: nextIndex,
        currentPickerUserId: nextPicker,
        currentPickDeadlineAt: new Date(Date.now() + draftEvent.pickTimeLimitSeconds * 1000),
      },
    });
  }

  return draftPick;
}
