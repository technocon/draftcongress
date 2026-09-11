import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/server/db/tenant-client";
import { computeSeasonStandings } from "@/server/domain/scoring/standings";
import { startDraftAction } from "@/server/actions/leagues";

export default async function SeasonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string; seasonId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { leagueId, seasonId } = await params;
  const { error } = await searchParams;
  const tenantId = session.user.activeTenantId;

  const season = await withTenant(tenantId, (tx) =>
    tx.season.findUnique({
      where: { id: seasonId },
      include: {
        league: { include: { memberships: { where: { userId: session.user.id } } } },
        draftEvent: true,
        rosters: { include: { owner: { select: { id: true, name: true, email: true } } } },
      },
    })
  );
  if (!season || season.leagueId !== leagueId) notFound();

  const isAdmin = season.league.memberships[0]?.role === "admin";
  const standings = season.status === "active" || season.status === "closed" ? await computeSeasonStandings(seasonId, tenantId) : [];
  const rosterOwnerById = new Map(season.rosters.map((r) => [r.id, r.owner]));

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div>
        <Link href={`/leagues/${leagueId}`} className="text-sm underline text-neutral-500">
          ← {season.league.name}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          {season.electionCycle} season <span className="text-sm text-neutral-500 font-normal">({season.status})</span>
        </h1>
      </div>

      {season.status === "pre_draft" && !season.draftEvent && isAdmin && (
        <form action={startDraftAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <button type="submit" className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium">
            Start draft
          </button>
        </form>
      )}

      {season.draftEvent && (
        <Link
          href={`/draft/${season.draftEvent.id}?leagueId=${leagueId}`}
          className="rounded-md border border-neutral-200 dark:border-neutral-800 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 inline-block w-fit"
        >
          {season.draftEvent.status === "complete" ? "View draft results →" : "Go to draft →"}
        </Link>
      )}

      {standings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Standings</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.rosterId} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 pr-4">
                    {i === 0 && "🏆 "}
                    {rosterOwnerById.get(s.rosterId)?.name ?? rosterOwnerById.get(s.rosterId)?.email}
                  </td>
                  <td className="py-2">{s.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
