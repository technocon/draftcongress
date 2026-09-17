import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runElectionResultsImport } from "@/server/domain/reference-data/import-election-results";

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const summary = await runElectionResultsImport();
  return NextResponse.json(summary);
}
