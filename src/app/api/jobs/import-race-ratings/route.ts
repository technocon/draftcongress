import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runRaceRatingsImport } from "@/server/domain/reference-data/import-race-ratings";

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const summary = await runRaceRatingsImport();
  return NextResponse.json(summary);
}
