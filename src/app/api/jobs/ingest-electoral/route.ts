import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runElectoralIngestion } from "@/server/domain/scoring/ingest";

const LOOKBACK_DAYS = 3;

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const results = await runElectoralIngestion(since);

  return NextResponse.json({ since: since.toISOString(), results });
}
