import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/server/db/tenant-client";
import { joinLeagueAction, startSeasonAction, inviteOwnerAction } from "@/server/actions/leagues";

export default async function LeagueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { leagueId } = await params;
  const { error } = await searchParams;
  const tenantId = session.user.activeTenantId;

  const league = await withTenant(tenantId, (tx) =>
    tx.league.findUnique({
      where: { id: leagueId },
      include: {
        memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
        seasons: { orderBy: { startDate: "desc" } },
        blocTaxonomy: true,
      },
    })
  );
  if (!league) notFound();

  const myMembership = league.memberships.find((m) => m.userId === session.user.id);
  const isAdmin = myMembership?.role === "admin";
  const isMember = Boolean(myMembership);
  const hasActiveOrDraftingSeason = league.seasons.some((s) => s.status === "drafting" || s.status === "active");
  // Every member (owner or admin) gets a roster when a season starts —
  // admin is a permission on top of participating, not a separate
  // non-playing role. See start-season.ts.
  const memberCount = league.memberships.length;

  const h = await headers();
  const inviteUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/leagues/${league.id}`;

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
          {league.name}
        </h1>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          {league.draftFormat} draft · {league.rosterSize}-bloc rosters · {league.blocTaxonomy.name} ·{" "}
          {league.isPrivate ? "Private" : "Public"} · {league.redraftPolicy.replace(/_/g, " ")}
        </p>
      </div>

      {!isMember && (
        <form action={joinLeagueAction}>
          <input type="hidden" name="leagueId" value={league.id} />
          <button type="submit" className="btn-primary">
            Join this league
          </button>
        </form>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Members ({memberCount})</h2>
        <p className="text-xs text-[var(--color-ink-soft)] mb-3">
          Every member gets a roster when a season starts — as the admin, you can play too, or just invite others below.
        </p>
        <ul className="flex flex-col gap-1 text-sm mb-4">
          {league.memberships.map((m) => (
            <li key={m.id} className="text-[var(--color-ink-soft)]">
              {m.user.name ?? m.user.email} <span className="text-xs">({m.role})</span>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <div className="flex flex-col gap-4 max-w-sm">
            <div>
              <p className="text-sm font-medium mb-1">Invite link</p>
              <p className="text-xs text-[var(--color-ink-soft)] mb-1">
                Anyone signed in can join this league from this link — send it to your friends.
              </p>
              <input readOnly value={inviteUrl} className="rc-input w-full text-sm" />
            </div>

            <form action={inviteOwnerAction} className="flex flex-col gap-2">
              <input type="hidden" name="leagueId" value={league.id} />
              <label className="flex flex-col gap-1 text-sm">
                Add an owner by email (they need an account already)
                <input name="email" type="email" required placeholder="friend@example.com" className="rc-input" />
              </label>
              <button type="submit" className="btn-secondary w-fit">
                Add owner
              </button>
            </form>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Seasons</h2>
        {league.seasons.length === 0 ? (
          <p className="text-[var(--color-ink-soft)] text-sm">No seasons yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 mb-4">
            {league.seasons.map((s) => (
              <li key={s.id} className="rc-card px-4 py-3 hover:bg-[var(--color-paper-muted)]">
                <Link href={`/leagues/${league.id}/seasons/${s.id}`} className="headline-link">
                  {s.electionCycle}
                </Link>
                <span className="ml-2 text-xs text-[var(--color-ink-soft)]">{s.status}</span>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && !hasActiveOrDraftingSeason && (
          <form action={startSeasonAction} className="flex flex-col gap-3 max-w-sm">
            <input type="hidden" name="leagueId" value={league.id} />
            <label className="flex flex-col gap-1 text-sm">
              Election cycle
              <input name="electionCycle" required placeholder="2026" className="rc-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Start date
              <input name="startDate" type="date" required className="rc-input" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              End date
              <input name="endDate" type="date" required className="rc-input" />
            </label>
            {league.redraftPolicy === "admin_choice_per_cycle" && (
              <label className="flex flex-col gap-1 text-sm">
                This cycle&apos;s redraft policy
                <select name="redraftChoice" defaultValue="full_redraft" className="rc-input">
                  <option value="full_redraft">Full redraft</option>
                  <option value="keeper">Keeper (carry over prior season&apos;s blocs)</option>
                </select>
              </label>
            )}
            {league.redraftPolicy === "keeper" && league.seasons.length > 0 && (
              <p className="text-xs text-[var(--color-ink-soft)]">
                This league keeps blocs between seasons — returning owners&apos; rosters will carry over automatically.
              </p>
            )}
            <button type="submit" className="btn-primary">
              Start new season
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
