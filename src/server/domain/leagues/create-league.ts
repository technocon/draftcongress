import { z } from "zod";
import { withTenant } from "@/server/db/tenant-client";
import { prisma } from "@/server/db/client";

const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(200),
  draftFormat: z.enum(["snake", "async", "auction", "custom"]).default("async"),
  redraftPolicy: z.enum(["full_redraft", "keeper", "admin_choice_per_cycle"]).default("full_redraft"),
  isPrivate: z.boolean().default(true),
  rosterSize: z.number().int().min(1).max(50).default(8),
  /** Defaults to the platform-default free taxonomy/scoring config if omitted — SRD A2's "sensible defaults, under 2 minutes." */
  blocTaxonomyId: z.string().uuid().optional(),
  scoringConfigId: z.string().uuid().optional(),
});

export type CreateLeagueInput = z.input<typeof createLeagueSchema>;

/**
 * SRD A2: "A public user can create a private league inside the shared
 * platform in under 2 minutes, with sensible defaults pre-filled." The
 * defaults here are the platform-default free-tier taxonomy and scoring
 * config seeded by prisma/seed.ts — a league admin can override either at
 * creation.
 */
export async function createLeague(tenantId: string, adminUserId: string, input: CreateLeagueInput) {
  const parsed = createLeagueSchema.parse(input);

  const [defaultTaxonomy, defaultScoringConfig] = await Promise.all([
    parsed.blocTaxonomyId
      ? null
      : prisma.blocTaxonomy.findFirstOrThrow({ where: { tenantId: null, tierRequired: "free" } }),
    parsed.scoringConfigId ? null : prisma.scoringConfig.findFirstOrThrow({ where: { tenantId: null } }),
  ]);

  return withTenant(tenantId, (tx) =>
    tx.league.create({
      data: {
        tenantId,
        name: parsed.name,
        adminUserId,
        draftFormat: parsed.draftFormat,
        redraftPolicy: parsed.redraftPolicy,
        isPrivate: parsed.isPrivate,
        rosterSize: parsed.rosterSize,
        blocTaxonomyId: parsed.blocTaxonomyId ?? defaultTaxonomy!.id,
        scoringConfigId: parsed.scoringConfigId ?? defaultScoringConfig!.id,
        memberships: {
          create: { tenantId, userId: adminUserId, role: "admin" },
        },
      },
      include: { memberships: true },
    })
  );
}
