"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { submitDraftPick } from "@/server/domain/drafts/submit-pick";

export async function submitDraftPickAction(formData: FormData) {
  const session = await requireSession();
  const draftEventId = String(formData.get("draftEventId") ?? "");
  const blocId = String(formData.get("blocId") ?? "");
  const leagueId = formData.get("leagueId") ? String(formData.get("leagueId")) : null;

  const qs = leagueId ? `?leagueId=${leagueId}` : "";
  try {
    await submitDraftPick(session.user.activeTenantId, session.user.id, draftEventId, blocId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`/draft/${draftEventId}${qs}&error=${encodeURIComponent(message)}`.replace("?&", "?"));
  }

  redirect(`/draft/${draftEventId}${qs}`);
}
