"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireSession } from "@/lib/session";
import { createCheckoutSession, createPortalSession } from "@/server/domain/billing/checkout";

async function originFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function startCheckoutAction() {
  const session = await requireSession();
  const origin = await originFromHeaders();
  const url = await createCheckoutSession(session.user.id, session.user.email ?? null, `${origin}/account/billing`);
  redirect(url);
}

export async function openBillingPortalAction() {
  const session = await requireSession();
  const origin = await originFromHeaders();
  const url = await createPortalSession(session.user.id, `${origin}/account/billing`);
  redirect(url);
}
