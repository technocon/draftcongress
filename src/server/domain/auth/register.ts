import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant-client";
import { getPublicTenant } from "@/server/auth/tenant";
import { registerSchema } from "@/lib/validation";

export class RegistrationError extends Error {}

/**
 * Shared by /api/register (a plain HTTP path for non-browser clients) and
 * the register-page server action — Credentials-provider sign-in is
 * intentionally decoupled from Auth.js's adapter-driven createUser flow
 * (see src/server/auth/index.ts's events.createUser comment), so this is
 * where hashing + row creation + public-tenant enrollment actually happens.
 */
export async function registerUser(input: { email: string; password: string; name?: string }) {
  const parsed = registerSchema.parse(input);

  const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (existing) {
    throw new RegistrationError("An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(parsed.password, 12);
  const tenant = await getPublicTenant();

  // TenantMembership is RLS-enforced (tenant-scoped) — the transaction
  // MUST run through withTenant so app.current_tenant_id is set, or the
  // INSERT is rejected by Postgres (caught by hand-testing this flow: the
  // raw prisma.$transaction() this used to call has no tenant context and
  // RLS correctly refuses the write). User itself has no RLS policy, so
  // it's fine to create in the same tenant-scoped transaction.
  return withTenant(tenant.id, async (tx) => {
    const user = await tx.user.create({
      data: { email: parsed.email, name: parsed.name, passwordHash },
    });
    await tx.tenantMembership.create({
      data: { tenantId: tenant.id, userId: user.id, role: "member" },
    });
    return user;
  });
}
