import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazily constructed so importing this module doesn't throw in
 * environments (tests, a fresh local checkout) where STRIPE_SECRET_KEY
 * isn't set yet — only code paths that actually need Stripe pay the cost
 * of requiring the key.
 */
export function getStripeClient(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  cached = new Stripe(key);
  return cached;
}
