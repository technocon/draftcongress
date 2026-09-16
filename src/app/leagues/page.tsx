import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/server/db/tenant-client";
import { createLeagueAction, joinLeagueAction } from "@/server/actions/leagues";
import { StateFlag } from "@/components/state-flag";
import { StateFlagPicker } from "@/components/state-flag-picker";

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { error } = await searchParams;
  const tenantId = session.user.activeTenantId;
  const userId = session.user.id;

  const { myLeagues, browsableLeagues } = await withTenant(tenantId, async (tx) => {
    const myMemberships = await tx.leagueMembership.findMany({
      where: { userId },
      include: { league: true },
    });
    const myLeagueIds = myMemberships.map((m) => m.leagueId);

    const browsable = await tx.league.findMany({
      where: { isPrivate: false, id: { notIn: myLeagueIds } },
      take: 25,
    });

    return { myLeagues: myMemberships, browsableLeagues: browsable };
  });

  return (
    <div className="flex flex-col gap-10">
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <section>
        <h1 className="text-2xl font-semibold mb-4 section-label">Your leagues</h1>
        {myLeagues.length === 0 ? (
          <p className="text-[var(--color-ink-soft)] text-sm">You&apos;re not in any leagues yet — create one below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {myLeagues.map((m) => (
              <li key={m.leagueId} className="rc-card flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-paper-muted)]">
                <StateFlag code={m.league.homeState} size={28} />
                <Link href={`/leagues/${m.leagueId}`} className="headline-link text-lg">
                  {m.league.name}
                </Link>
                <span className="text-xs text-[var(--color-ink-soft)]">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Create a league</h2>
        {/* SRD A2: sensible defaults pre-filled — async draft, free-tier taxonomy, platform scoring config. */}
        <form action={createLeagueAction} className="flex flex-col gap-3 max-w-sm">
          <label className="flex flex-col gap-1 text-sm">
            League name
            <input name="name" required className="rc-input" />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            Home state
            <StateFlagPicker />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Roster size
            <input name="rosterSize" type="number" defaultValue={8} min={1} max={50} className="rc-input" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Redraft policy
            <select name="redraftPolicy" defaultValue="full_redraft" className="rc-input">
              <option value="full_redraft">Full redraft each cycle</option>
              <option value="keeper">Keeper — carry rosters over between cycles</option>
              <option value="admin_choice_per_cycle">Admin decides each cycle</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="isPrivate" type="checkbox" defaultChecked />
            Private (invite-only)
          </label>
          <button type="submit" className="btn-primary">
            Create league
          </button>
        </form>
      </section>

      {browsableLeagues.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 section-label">Public leagues</h2>
          <ul className="flex flex-col gap-2">
            {browsableLeagues.map((league) => (
              <li key={league.id} className="rc-card flex items-center gap-3 px-4 py-3">
                <StateFlag code={league.homeState} size={28} />
                <span className="headline-link flex-1">{league.name}</span>
                <form action={joinLeagueAction}>
                  <input type="hidden" name="leagueId" value={league.id} />
                  <button type="submit" className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] underline">
                    Join
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
