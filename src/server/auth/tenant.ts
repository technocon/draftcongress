import { prisma } from "@/server/db/client";

/**
 * Resolves which Tenant a request belongs to.
 *
 * Written generically (by host) but hardcoded to always return the seeded
 * public tenant for Phase 1 — per the architecture plan §3, this is meant
 * to be a data change later (when white-label tenants exist and route by
 * subdomain/custom domain), not a rewrite. `host` is accepted now so call
 * sites don't need to change when that day comes.
 */
export async function resolveTenantForRequest(_host?: string | null): Promise<{ id: string; slug: string }> {
  return getPublicTenant();
}

let publicTenantCache: { id: string; slug: string } | null = null;

export async function getPublicTenant(): Promise<{ id: string; slug: string }> {
  if (publicTenantCache) return publicTenantCache;

  const slug = process.env.PUBLIC_TENANT_SLUG ?? "public";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) {
    throw new Error(
      `Public tenant (slug "${slug}") not found — run \`npm run db:seed\` before starting the app.`
    );
  }
  publicTenantCache = tenant;
  return tenant;
}
