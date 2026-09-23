import type { prisma } from "@/server/db/client";

const CHAMBER_NAME_BY_SCOPE = {
  house: "U.S. House of Representatives",
  senate: "U.S. Senate",
} as const;

export type ChamberScope = "all" | "house" | "senate";

/**
 * Resolves a league's chamberScope to a Prisma where-clause fragment for
 * filtering Bloc rows: `{}` (no restriction) for "all", `{ chamberId }`
 * for a specific chamber. Bloc is already chamber-scoped
 * (Bloc.chamberId) — this is the one place that maps a league's chosen
 * scope onto that existing column, used everywhere "available blocs for
 * this league" is queried (start-draft's sizing check, auto-pick's
 * candidate pool, submit-pick's validation, the draft page's pick list).
 */
export async function blocChamberFilter(
  tx: Pick<typeof prisma, "chamber">,
  chamberScope: ChamberScope
): Promise<{ chamberId?: string }> {
  if (chamberScope === "all") return {};
  const chamber = await tx.chamber.findFirstOrThrow({ where: { name: CHAMBER_NAME_BY_SCOPE[chamberScope] } });
  return { chamberId: chamber.id };
}
