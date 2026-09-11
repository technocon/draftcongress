import { NextResponse } from "next/server";

/**
 * Every /api/jobs/* route is hit by an external scheduler — Hostinger's
 * hPanel Cron Jobs feature in production, not a persistent worker process
 * (see the architecture plan §5, §8). This shared-secret check is the only
 * thing standing between the public internet and these endpoints, since
 * they're plain HTTP routes by design.
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SHARED_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SHARED_SECRET is not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
