import { prisma } from "@/server/db/client";

export interface PartySlice {
  party: string;
  count: number;
}

export interface BlocSlice {
  blocId: string;
  blocName: string;
  blocType: string;
  count: number;
}

/**
 * Party composition of a chamber (SRD's "House/Senate breakdown" chart) —
 * grouped from Legislator.party directly, active members only.
 */
export async function getChamberPartyBreakdown(chamberId: string): Promise<PartySlice[]> {
  const legislators = await prisma.legislator.groupBy({
    by: ["party"],
    where: { chamberId, status: "active" },
    _count: { _all: true },
  });
  return legislators
    .map((row) => ({ party: row.party, count: row._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Bloc/caucus membership breakdown within a chamber — how many currently-
 * active members each seeded bloc has. Counts ANY membership active right
 * now (endDate null or in the future), not scoped to a taxonomy tier, so
 * this reflects the chamber's real composition regardless of which
 * taxonomy a viewing league happens to use.
 */
export async function getChamberBlocBreakdown(chamberId: string): Promise<BlocSlice[]> {
  const blocs = await prisma.bloc.findMany({
    where: { chamberId },
    include: {
      _count: {
        select: {
          memberships: {
            where: { OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
          },
        },
      },
    },
  });
  return blocs
    .map((b) => ({ blocId: b.id, blocName: b.name, blocType: b.blocType, count: b._count.memberships }))
    .sort((a, b) => b.count - a.count);
}
