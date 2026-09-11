-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('public', 'white_label', 'enterprise');

-- CreateEnum
CREATE TYPE "TenantMemberRole" AS ENUM ('member', 'admin');

-- CreateEnum
CREATE TYPE "LegislativeLevel" AS ENUM ('national', 'state', 'county', 'city', 'international');

-- CreateEnum
CREATE TYPE "LegislatorStatus" AS ENUM ('active', 'former');

-- CreateEnum
CREATE TYPE "BlocTier" AS ENUM ('free', 'paid');

-- CreateEnum
CREATE TYPE "BlocType" AS ENUM ('leadership', 'ideological', 'policy', 'custom');

-- CreateEnum
CREATE TYPE "ScoringEventType" AS ENUM ('bill_passed', 'bill_sponsored', 'vote_cast', 'committee_action', 're_election_won', 'seat_flip', 'primary_result');

-- CreateEnum
CREATE TYPE "DraftFormat" AS ENUM ('snake', 'async', 'auction', 'custom');

-- CreateEnum
CREATE TYPE "RedraftPolicy" AS ENUM ('full_redraft', 'keeper', 'admin_choice_per_cycle');

-- CreateEnum
CREATE TYPE "LeagueRole" AS ENUM ('owner', 'admin');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('pre_draft', 'drafting', 'active', 'closed');

-- CreateEnum
CREATE TYPE "DraftEventStatus" AS ENUM ('scheduled', 'in_progress', 'complete');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'canceled', 'incomplete');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('free', 'paid');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "TenantType" NOT NULL DEFAULT 'public',
    "name" TEXT NOT NULL,
    "branding_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TenantMemberRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legislative_bodies" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "level" "LegislativeLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "chamber_count" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "legislative_bodies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chambers" (
    "id" UUID NOT NULL,
    "legislative_body_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "total_seats" INTEGER NOT NULL,
    "majority_threshold" INTEGER NOT NULL,

    CONSTRAINT "chambers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legislators" (
    "id" UUID NOT NULL,
    "chamber_id" UUID NOT NULL,
    "bioguide_id" TEXT,
    "full_name" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT,
    "status" "LegislatorStatus" NOT NULL DEFAULT 'active',
    "term_start" TIMESTAMP(3),
    "term_end" TIMESTAMP(3),

    CONSTRAINT "legislators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloc_taxonomies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "name" TEXT NOT NULL,
    "tier_required" "BlocTier" NOT NULL DEFAULT 'free',

    CONSTRAINT "bloc_taxonomies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocs" (
    "id" UUID NOT NULL,
    "chamber_id" UUID NOT NULL,
    "taxonomy_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bloc_type" "BlocType" NOT NULL,
    "is_paid_tier" BOOLEAN NOT NULL DEFAULT false,
    "draft_rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "blocs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloc_memberships" (
    "id" UUID NOT NULL,
    "bloc_id" UUID NOT NULL,
    "legislator_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),

    CONSTRAINT "bloc_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "legislative_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "electoral_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_rules" (
    "id" UUID NOT NULL,
    "scoring_config_id" UUID NOT NULL,
    "event_type" "ScoringEventType" NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "applies_to_tier" "BlocTier" NOT NULL DEFAULT 'free',

    CONSTRAINT "scoring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_events" (
    "id" UUID NOT NULL,
    "bloc_id" UUID NOT NULL,
    "legislator_id" UUID,
    "event_type" "ScoringEventType" NOT NULL,
    "points_awarded" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "bloc_taxonomy_id" UUID NOT NULL,
    "scoring_config_id" UUID NOT NULL,
    "draft_format" "DraftFormat" NOT NULL DEFAULT 'async',
    "redraft_policy" "RedraftPolicy" NOT NULL DEFAULT 'full_redraft',
    "is_private" BOOLEAN NOT NULL DEFAULT true,
    "roster_size" INTEGER NOT NULL DEFAULT 8,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "LeagueRole" NOT NULL DEFAULT 'owner',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "election_cycle" TEXT NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'pre_draft',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_blocs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "roster_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "bloc_id" UUID NOT NULL,
    "draft_pick_id" UUID,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_blocs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "format" "DraftFormat" NOT NULL DEFAULT 'async',
    "status" "DraftEventStatus" NOT NULL DEFAULT 'scheduled',
    "pick_order" JSONB NOT NULL,
    "pick_time_limit_seconds" INTEGER NOT NULL DEFAULT 86400,
    "current_pick_index" INTEGER NOT NULL DEFAULT 0,
    "current_picker_user_id" UUID,
    "current_pick_deadline_at" TIMESTAMP(3),

    CONSTRAINT "draft_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_picks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "draft_event_id" UUID NOT NULL,
    "roster_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "bloc_id" UUID NOT NULL,
    "pick_number" INTEGER NOT NULL,
    "is_auto_pick" BOOLEAN NOT NULL DEFAULT false,
    "picked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'incomplete',
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'free',
    "current_period_end" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_entitlements" (
    "tenant_id" UUID NOT NULL,
    "grants_paid_tier_to_all_users" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key" ON "tenant_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "legislators_bioguide_id_key" ON "legislators"("bioguide_id");

-- CreateIndex
CREATE INDEX "legislators_chamber_id_idx" ON "legislators"("chamber_id");

-- CreateIndex
CREATE INDEX "blocs_taxonomy_id_idx" ON "blocs"("taxonomy_id");

-- CreateIndex
CREATE INDEX "blocs_chamber_id_idx" ON "blocs"("chamber_id");

-- CreateIndex
CREATE INDEX "bloc_memberships_bloc_id_idx" ON "bloc_memberships"("bloc_id");

-- CreateIndex
CREATE INDEX "bloc_memberships_legislator_id_idx" ON "bloc_memberships"("legislator_id");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_rules_scoring_config_id_event_type_key" ON "scoring_rules"("scoring_config_id", "event_type");

-- CreateIndex
CREATE INDEX "scoring_events_bloc_id_idx" ON "scoring_events"("bloc_id");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_events_source_external_id_key" ON "scoring_events"("source", "external_id");

-- CreateIndex
CREATE INDEX "leagues_tenant_id_idx" ON "leagues"("tenant_id");

-- CreateIndex
CREATE INDEX "league_memberships_tenant_id_idx" ON "league_memberships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_memberships_league_id_user_id_key" ON "league_memberships"("league_id", "user_id");

-- CreateIndex
CREATE INDEX "seasons_tenant_id_idx" ON "seasons"("tenant_id");

-- CreateIndex
CREATE INDEX "seasons_league_id_idx" ON "seasons"("league_id");

-- CreateIndex
CREATE INDEX "rosters_tenant_id_idx" ON "rosters"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rosters_season_id_owner_user_id_key" ON "rosters"("season_id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roster_blocs_draft_pick_id_key" ON "roster_blocs"("draft_pick_id");

-- CreateIndex
CREATE INDEX "roster_blocs_tenant_id_idx" ON "roster_blocs"("tenant_id");

-- CreateIndex
CREATE INDEX "roster_blocs_roster_id_idx" ON "roster_blocs"("roster_id");

-- CreateIndex
CREATE UNIQUE INDEX "roster_blocs_season_id_bloc_id_key" ON "roster_blocs"("season_id", "bloc_id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_events_season_id_key" ON "draft_events"("season_id");

-- CreateIndex
CREATE INDEX "draft_events_tenant_id_idx" ON "draft_events"("tenant_id");

-- CreateIndex
CREATE INDEX "draft_picks_tenant_id_idx" ON "draft_picks"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_picks_draft_event_id_pick_number_key" ON "draft_picks"("draft_event_id", "pick_number");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chambers" ADD CONSTRAINT "chambers_legislative_body_id_fkey" FOREIGN KEY ("legislative_body_id") REFERENCES "legislative_bodies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legislators" ADD CONSTRAINT "legislators_chamber_id_fkey" FOREIGN KEY ("chamber_id") REFERENCES "chambers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloc_taxonomies" ADD CONSTRAINT "bloc_taxonomies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs" ADD CONSTRAINT "blocs_chamber_id_fkey" FOREIGN KEY ("chamber_id") REFERENCES "chambers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocs" ADD CONSTRAINT "blocs_taxonomy_id_fkey" FOREIGN KEY ("taxonomy_id") REFERENCES "bloc_taxonomies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloc_memberships" ADD CONSTRAINT "bloc_memberships_bloc_id_fkey" FOREIGN KEY ("bloc_id") REFERENCES "blocs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloc_memberships" ADD CONSTRAINT "bloc_memberships_legislator_id_fkey" FOREIGN KEY ("legislator_id") REFERENCES "legislators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_configs" ADD CONSTRAINT "scoring_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_rules" ADD CONSTRAINT "scoring_rules_scoring_config_id_fkey" FOREIGN KEY ("scoring_config_id") REFERENCES "scoring_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_events" ADD CONSTRAINT "scoring_events_bloc_id_fkey" FOREIGN KEY ("bloc_id") REFERENCES "blocs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_events" ADD CONSTRAINT "scoring_events_legislator_id_fkey" FOREIGN KEY ("legislator_id") REFERENCES "legislators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_bloc_taxonomy_id_fkey" FOREIGN KEY ("bloc_taxonomy_id") REFERENCES "bloc_taxonomies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_scoring_config_id_fkey" FOREIGN KEY ("scoring_config_id") REFERENCES "scoring_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_blocs" ADD CONSTRAINT "roster_blocs_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_blocs" ADD CONSTRAINT "roster_blocs_bloc_id_fkey" FOREIGN KEY ("bloc_id") REFERENCES "blocs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_blocs" ADD CONSTRAINT "roster_blocs_draft_pick_id_fkey" FOREIGN KEY ("draft_pick_id") REFERENCES "draft_picks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_events" ADD CONSTRAINT "draft_events_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_draft_event_id_fkey" FOREIGN KEY ("draft_event_id") REFERENCES "draft_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_bloc_id_fkey" FOREIGN KEY ("bloc_id") REFERENCES "blocs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
