import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/server/jobs/auth";
import { runCongressMembersImport } from "@/server/domain/reference-data/import-congress-members";

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const summary = await runCongressMembersImport();
  return NextResponse.json(summary);
}
