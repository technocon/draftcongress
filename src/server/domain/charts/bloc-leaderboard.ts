import { prisma } from "@/server/db/client";
import { categoryFor } from "@/server/domain/scoring/event-category";

export interface BlocScore {
  blocId: string;
  blocName: string;
  score: number;
}

interface Weights {
  legislative: number;
  electoral: number;
}

/**
 * Ranks blocs by weighted point total — the "caucus races" chart. Two
 * modes:
 *   - `taxonomyId` alone: every bloc in that taxonomy (the draft-board
 *     use case — "who's hot" among everything still draftable).
 *   - `blocIds` given instead: exactly those blocs (the season-page use
 *     case — only the blocs actually drafted this season).
 * Same weight application as src/server/domain/scoring/standings.ts —
 * kept as a separate, simpler function here since this has no per-roster
 * grouping to do, just per-bloc totals.
 */
export async function computeBlocLeaderboard(
  input: { taxonomyId: string; chamberId?: string; weights: Weights } | { blocIds: string[]; weights: Weights }
): Promise<BlocScore[]> {
  const blocs = await prisma.bloc.findMany({
    where:
      "taxonomyId" in input
        ? { taxonomyId: input.taxonomyId, ...(input.chamberId ? { chamberId: input.chamberId } : {}) }
        : { id: { in: input.blocIds } },
    select: { id: true, name: true },
  });
  if (blocs.length === 0) return [];

  const events = await prisma.scoringEvent.findMany({
    where: { blocId: { in: blocs.map((b) => b.id) } },
    select: { blocId: true, eventType: true, pointsAwarded: true },
  });

  const scoreByBloc = new Map<string, number>();
  for (const event of events) {
    const weight = categoryFor(event.eventType) === "legislative" ? input.weights.legislative : input.weights.electoral;
    scoreByBloc.set(event.blocId, (scoreByBloc.get(event.blocId) ?? 0) + event.pointsAwarded * weight);
  }

  return blocs
    .map((b) => ({ blocId: b.id, blocName: b.name, score: scoreByBloc.get(b.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
