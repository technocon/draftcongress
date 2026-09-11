import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { createAdminClient } from "@/server/db/client";
import { resolveExpiredPicks } from "@/server/domain/drafts/auto-pick";

/**
 * Sweeps every in-progress draft across every tenant, resolving overdue
 * picks via auto-pick. Complements the lazy resolution in
 * get-draft-state.ts/submit-pick.ts so a draft still advances even if
 * nobody is actively polling it — see the architecture plan §5/§8.
 *
 * Uses the admin (BYPASSRLS) client only to enumerate WHICH draft events
 * are in_progress across all tenants (a genuinely cross-tenant platform
 * operation); actually resolving each one still goes through
 * resolveExpiredPicks -> withTenant, scoped to that draft's own tenant.
 */
export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const admin = createAdminClient();
  const inProgress = await admin.draftEvent.findMany({
    where: { status: "in_progress" },
    select: { id: true, tenantId: true },
  });

  const results = await Promise.all(
    inProgress.map(async (d) => {
      try {
        const resolved = await resolveExpiredPicks(d.tenantId, d.id);
        return { draftEventId: d.id, resolved };
      } catch (err) {
        return { draftEventId: d.id, resolved: 0, error: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  await admin.$disconnect();
  return NextResponse.json({ swept: inProgress.length, results });
}
