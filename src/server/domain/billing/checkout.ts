import { prisma } from "@/server/db/client";
import { getStripeClient } from "./stripe-client";

/**
 * Creates a Stripe Checkout Session for the single placeholder "Individual
 * Paid Tier" price (SRD open question #7 — real price points TBD). Hosted
 * Checkout only — no custom card-collection UI, per the architecture plan.
 * Creates the Stripe Customer (and the local Subscription row) on first use.
 */
export async function createCheckoutSession(userId: string, userEmail: string | null, returnUrl: string) {
  const stripe = getStripeClient();
  const priceId = process.env.STRIPE_PAID_TIER_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PAID_TIER_PRICE_ID is not configured");

  let subscription = await prisma.subscription.findUnique({ where: { userId } });

  let stripeCustomerId = subscription?.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;
    subscription = await prisma.subscription.upsert({
      where: { userId },
      update: { stripeCustomerId },
      create: { userId, stripeCustomerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=cancelled`,
    metadata: { userId },
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

/** Stripe Customer Portal — subscription management (cancel, update payment method) without custom UI. */
export async function createPortalSession(userId: string, returnUrl: string) {
  const stripe = getStripeClient();
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (!subscription?.stripeCustomerId) {
    throw new Error("No Stripe customer on file for this user yet — start a checkout first");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}
