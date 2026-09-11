import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant-client";

export type EntitlementTier = "free" | "paid";
export type Entitlement = {
  tier: EntitlementTier;
  source: "tenant_grant" | "subscription" | "none";
};

/**
 * Resolves whether `userId` is entitled to paid-tier bloc/data visibility
 * within `tenantId` (SRD Epic E3: "the system must know, for every roster
 * view, whether the viewer is entitled to paid-tier ... visibility").
 *
 * Order per SRD E2: an org-wide tenant grant wins over the user's own
 * individual subscription. This is the SINGLE source of truth for
 * entitlement — the JWT/session copy of this result (see ../auth/index.ts)
 * is a cache for UI gating ONLY. Every actual authorization boundary
 * (draft-pool filtering, paid-tier data reads) must call this function
 * again inside its own transaction rather than trusting the session token,
 * to avoid stale-JWT privilege bugs.
 */
export async function resolveEntitlement(userId: string, tenantId: string): Promise<Entitlement> {
  const tenantGrant = await withTenant(tenantId, (tx) =>
    tx.tenantEntitlement.findUnique({ where: { tenantId } })
  );
  if (tenantGrant?.grantsPaidTierToAllUsers) {
    return { tier: "paid", source: "tenant_grant" };
  }

  // Subscription is deliberately NOT tenant-scoped (queried via the plain
  // runtime client, not withTenant) — a personal subscription unlocks
  // paid-tier data in ANY league the user joins, not just this tenant
  // (SRD E1: "not tied to a single league").
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (subscription?.status === "active" && subscription.tier === "paid") {
    return { tier: "paid", source: "subscription" };
  }

  return { tier: "free", source: "none" };
}

/**
 * Server-side authorization guard. Throws if `userId` is not entitled to
 * `requiredTier` within `tenantId`. Call this at the actual point of every
 * paid-tier read/write (draft pick submission, paid-tier standings reads) —
 * never substitute a session-token check for this.
 */
export async function requireEntitlement(
  userId: string,
  tenantId: string,
  requiredTier: EntitlementTier
): Promise<Entitlement> {
  const entitlement = await resolveEntitlement(userId, tenantId);
  if (requiredTier === "paid" && entitlement.tier !== "paid") {
    throw new EntitlementError("Paid-tier entitlement required");
  }
  return entitlement;
}

export class EntitlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementError";
  }
}
