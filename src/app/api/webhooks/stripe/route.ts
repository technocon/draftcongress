import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/server/db/client";
import { getStripeClient } from "@/server/domain/billing/stripe-client";

/**
 * Syncs Stripe subscription state into the local Subscription row — the
 * single source of truth resolveEntitlement() reads (see
 * src/server/auth/entitlement.ts). Must verify the signature against the
 * RAW request body; Next.js App Router route handlers get that via
 * request.text(), not request.json() (which would already be parsed and
 * re-serialized, breaking signature verification).
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (customerId && subscriptionId) {
        await syncSubscription(customerId, subscriptionId);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await syncSubscription(customerId, sub.id, sub);
      break;
    }
    default:
      break; // ignore everything else
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(stripeCustomerId: string, stripeSubscriptionId: string, sub?: Stripe.Subscription) {
  const stripe = getStripeClient();
  const subscription = sub ?? (await stripe.subscriptions.retrieve(stripeSubscriptionId));

  const local = await prisma.subscription.findUnique({ where: { stripeCustomerId } });
  if (!local) {
    // Shouldn't happen (the customer is created by createCheckoutSession
    // before Checkout ever runs), but don't crash the webhook over it.
    return;
  }

  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  await prisma.subscription.update({
    where: { userId: local.userId },
    data: {
      stripeSubscriptionId,
      status: mapStripeStatus(subscription.status),
      tier: isActiveLike(subscription.status) ? "paid" : "free",
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
    },
  });
}

function isActiveLike(status: Stripe.Subscription.Status): boolean {
  return status === "active" || status === "trialing";
}

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "canceled" | "incomplete" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
    case "paused":
    default:
      return "canceled";
  }
}
