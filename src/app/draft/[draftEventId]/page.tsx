import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/server/db/client";
import { getDraftState } from "@/server/domain/drafts/get-draft-state";
import { resolveEntitlement } from "@/server/auth/entitlement";
import { submitDraftPickAction } from "@/server/actions/drafts";
import { AutoRefresh } from "@/components/auto-refresh";
import { computeBlocLeaderboard } from "@/server/domain/charts/bloc-leaderboard";
import { BlocLeaderboardChart } from "@/components/charts/bloc-leaderboard-chart";

export default async function DraftBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftEventId: string }>;
  searchParams: Promise<{ leagueId?: string; error?: string }>;
}) {
  const session = await requireSession();
  const { draftEventId } = await params;
  const { leagueId, error } = await searchParams;
  const tenantId = session.user.activeTenantId;

  let draftEvent;
  try {
    draftEvent = await getDraftState(tenantId, draftEventId);
  } catch {
    notFound();
  }

  const takenBlocIds = draftEvent.picks.map((p) => p.blocId);
  const availableBlocs = await prisma.bloc.findMany({
    where: { taxonomyId: draftEvent.season.league.blocTaxonomyId, id: { notIn: takenBlocIds } },
    include: { chamber: true },
    orderBy: { draftRank: "asc" },
  });

  const entitlement = await resolveEntitlement(session.user.id, tenantId);
  const isMyTurn = draftEvent.status === "in_progress" && draftEvent.currentPickerUserId === session.user.id;
  const pickOrder = draftEvent.pickOrder as string[];

  const weights = {
    legislative: draftEvent.season.league.scoringConfig.legislativeWeight,
    electoral: draftEvent.season.league.scoringConfig.electoralWeight,
  };
  const blocLeaderboard = await computeBlocLeaderboard({
    taxonomyId: draftEvent.season.league.blocTaxonomyId,
    weights,
  });

  return (
    <div className="flex flex-col gap-8">
      {draftEvent.status === "in_progress" && <AutoRefresh />}

      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div>
        {leagueId && (
          <Link href={`/leagues/${leagueId}`} className="text-sm underline text-[var(--color-ink-soft)]">
            ← {draftEvent.season.league.name}
          </Link>
        )}
        <h1 className="text-2xl font-semibold mt-1" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
          Draft <span className="text-sm text-[var(--color-ink-soft)] font-normal">({draftEvent.status})</span>
        </h1>
        {draftEvent.status === "in_progress" && (
          <p className="text-sm mt-1">
            {isMyTurn ? (
              <span className="font-semibold text-[var(--color-accent)]">It&apos;s your turn to pick.</span>
            ) : (
              "Waiting on another owner to pick."
            )}
            {draftEvent.currentPickDeadlineAt && (
              <span className="text-[var(--color-ink-soft)]"> Deadline: {draftEvent.currentPickDeadlineAt.toLocaleString()}</span>
            )}
          </p>
        )}
      </div>

      {draftEvent.status === "in_progress" && (
        <section>
          <h2 className="text-lg font-semibold mb-3 section-label">Available blocs</h2>
          {availableBlocs.length === 0 ? (
            <p className="text-[var(--color-ink-soft)] text-sm">No blocs remain.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {availableBlocs.map((bloc) => {
                const eligible = !bloc.isPaidTier || entitlement.tier === "paid";
                return (
                  <li key={bloc.id} className="rc-card flex items-center justify-between px-4 py-3">
                    <div>
                      <span className="headline-link">{bloc.name}</span>
                      <span className="ml-2 text-xs text-[var(--color-ink-soft)]">
                        {bloc.chamber.name} · {bloc.blocType}
                        {bloc.isPaidTier ? " · Paid tier" : ""}
                      </span>
                    </div>
                    {isMyTurn && eligible && (
                      <form action={submitDraftPickAction}>
                        <input type="hidden" name="draftEventId" value={draftEvent.id} />
                        <input type="hidden" name="blocId" value={bloc.id} />
                        {leagueId && <input type="hidden" name="leagueId" value={leagueId} />}
                        <button type="submit" className="btn-primary py-1.5">
                          Draft
                        </button>
                      </form>
                    )}
                    {isMyTurn && !eligible && <span className="text-xs text-[var(--color-ink-soft)]">Requires paid tier</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {blocLeaderboard.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 section-label">Caucus races</h2>
          <p className="text-xs text-[var(--color-ink-soft)] mb-3">
            Every bloc in this draft pool, ranked by weighted score so far — a quick read on who&apos;s racking up points.
          </p>
          <BlocLeaderboardChart data={blocLeaderboard} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Pick order</h2>
        <ol className="flex flex-wrap gap-2 text-sm">
          {pickOrder.map((userId, i) => (
            <li
              key={i}
              className={`rounded-md border px-2 py-1 ${
                draftEvent.currentPickerUserId === userId
                  ? "border-[var(--color-accent)] text-[var(--color-accent)] font-semibold"
                  : "border-[var(--color-rule)] text-[var(--color-ink-soft)]"
              }`}
            >
              {i + 1}. {userId === session.user.id ? "You" : userId.slice(0, 8)}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Picks</h2>
        {draftEvent.picks.length === 0 ? (
          <p className="text-[var(--color-ink-soft)] text-sm">No picks yet.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {draftEvent.picks.map((pick) => (
              <li key={pick.id}>
                <span className="text-[var(--color-ink-soft)]">#{pick.pickNumber}</span> {pick.bloc.name} —{" "}
                {pick.owner.name ?? "Owner"}
                {pick.isAutoPick && <span className="ml-2 text-xs text-[var(--color-ink-soft)]">(auto-pick)</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
