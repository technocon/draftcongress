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
import { StateFlag } from "@/components/state-flag";
import { blocChamberFilter } from "@/server/domain/leagues/chamber-scope";

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
  const chamberFilter = await blocChamberFilter(prisma, draftEvent.season.league.chamberScope);
  const availableBlocs = await prisma.bloc.findMany({
    where: { taxonomyId: draftEvent.season.league.blocTaxonomyId, ...chamberFilter, id: { notIn: takenBlocIds } },
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
    chamberId: chamberFilter.chamberId,
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
        <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
          <StateFlag code={draftEvent.season.league.homeState} size={28} />
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
                    <div className="flex items-center gap-2">
                      <span className="headline-link">{bloc.name}</span>
                      <span className="badge-pill">{bloc.blocType}</span>
                      <span className="text-xs text-[var(--color-ink-soft)]">{bloc.chamber.name}</span>
                      {bloc.isPaidTier && <span className="badge-pill bg-[var(--color-premium)]! text-white!">Paid</span>}
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
        <ol className="flex gap-2 text-sm overflow-x-auto pb-1">
          {pickOrder.map((userId, i) => {
            const onTheClock = draftEvent.currentPickerUserId === userId;
            return (
              <li
                key={i}
                className={`rc-card flex-shrink-0 px-3 py-2 text-center min-w-[84px] ${onTheClock ? "border-[var(--color-primary)] border-2" : ""}`}
              >
                <div className="text-xs text-[var(--color-ink-soft)] font-semibold">{i + 1}</div>
                <div className="font-bold">{userId === session.user.id ? "You" : userId.slice(0, 8)}</div>
                {onTheClock && <div className="badge-pill mt-1">ON THE CLOCK</div>}
              </li>
            );
          })}
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
