import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/server/db/tenant-client";

/**
 * Epic G3: "Tenant admins have a scoped admin view limited to their own
 * tenant's leagues, users, and configuration — never platform-wide data."
 * Every query here runs through withTenant(), so RLS is what actually
 * enforces the "never platform-wide" guarantee — this page could not leak
 * another tenant's rows even with a bug in the role check below.
 *
 * There's no self-service way to become a tenant admin yet (every new
 * user auto-enrolls with TenantMembership.role = "member" — see
 * src/server/auth/index.ts / register.ts). Promoting a user to tenant
 * admin today is an operator action (e.g. via Prisma Studio:
 * `npm run db:studio`, tenant_memberships table) — a self-service or
 * invite-based path is future work, out of scope for this Phase 1 stub.
 */
export default async function AdminPage() {
  const session = await requireSession();
  const tenantId = session.user.activeTenantId;

  const { membership, tenant, leagues, users, recentAuditLog } = await withTenant(tenantId, async (tx) => {
    const membership = await tx.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: session.user.id } },
    });
    if (membership?.role !== "admin") {
      return { membership, tenant: null, leagues: [], users: [], recentAuditLog: [] };
    }

    const [leagues, memberships, recentAuditLog] = await Promise.all([
      tx.league.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      tx.tenantMembership.findMany({
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
        orderBy: { joinedAt: "desc" },
        take: 100,
      }),
      tx.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    ]);

    return { membership, tenant: { id: tenantId }, leagues, users: memberships, recentAuditLog };
  });

  if (membership?.role !== "admin" || !tenant) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
        Tenant admin
      </h1>

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Leagues ({leagues.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {leagues.map((l) => (
            <li key={l.id} className="text-[var(--color-ink-soft)]">
              {l.name} <span className="text-xs">({l.draftFormat}, {l.isPrivate ? "private" : "public"})</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Users ({users.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {users.map((m) => (
            <li key={m.id} className="text-[var(--color-ink-soft)]">
              {m.user.name ?? m.user.email} <span className="text-xs">({m.role})</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 section-label">Recent audit log</h2>
        {recentAuditLog.length === 0 ? (
          <p className="text-[var(--color-ink-soft)] text-sm">Nothing logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs font-mono">
            {recentAuditLog.map((entry) => (
              <li key={entry.id} className="text-[var(--color-ink-soft)]">
                {entry.createdAt.toISOString()} · {entry.action} · {entry.entityType}/{entry.entityId.slice(0, 8)} ·
                source={entry.source}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
