import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runCampaignFinanceImport } from "@/server/domain/reference-data/import-campaign-finance";

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const summary = await runCampaignFinanceImport();
  return NextResponse.json(summary);
}
