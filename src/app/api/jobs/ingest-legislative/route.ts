import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runLegislativeIngestion } from "@/server/domain/scoring/ingest";

const LOOKBACK_DAYS = 3; // overlapping window, safe under upsert idempotency

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const results = await runLegislativeIngestion(since);

  return NextResponse.json({ since: since.toISOString(), results });
}
