import { requireSession } from "@/lib/session";
import { prisma } from "@/server/db/client";
import { startCheckoutAction, openBillingPortalAction } from "@/server/actions/billing";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await requireSession();
  const { checkout } = await searchParams;
  const subscription = await prisma.subscription.findUnique({ where: { userId: session.user.id } });
  const isPaid = session.user.entitlement?.tier === "paid";
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PAID_TIER_PRICE_ID);

  return (
    <div className="max-w-lg flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {checkout === "success" && (
        <p className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          Thanks! Your subscription is being activated — this can take a few seconds to sync.
        </p>
      )}

      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <p className="font-medium">
          Current tier: {isPaid ? "Paid" : "Free"}
          {session.user.entitlement?.source === "tenant_grant" && " (granted by your organization)"}
        </p>
        {subscription?.currentPeriodEnd && (
          <p className="text-sm text-neutral-500 mt-1">Renews {subscription.currentPeriodEnd.toLocaleDateString()}</p>
        )}
      </div>

      {!stripeConfigured ? (
        <p className="text-sm text-neutral-500">
          Billing isn&apos;t configured in this environment yet (STRIPE_SECRET_KEY / STRIPE_PAID_TIER_PRICE_ID missing).
        </p>
      ) : subscription?.stripeCustomerId ? (
        <form action={openBillingPortalAction}>
          <button type="submit" className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium">
            Manage subscription
          </button>
        </form>
      ) : (
        <form action={startCheckoutAction}>
          <button type="submit" className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium">
            Upgrade to paid tier
          </button>
        </form>
      )}

      <p className="text-xs text-neutral-400">
        No feature in the free tier requires payment info — upgrading unlocks ideological/policy-level blocs in any
        league you join.
      </p>
    </div>
  );
}
