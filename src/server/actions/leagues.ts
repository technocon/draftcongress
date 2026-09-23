"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { createLeague } from "@/server/domain/leagues/create-league";
import { joinLeague, inviteOwnerByEmail } from "@/server/domain/leagues/join-league";
import { startSeason } from "@/server/domain/leagues/start-season";
import { closeSeason } from "@/server/domain/leagues/close-season";
import { startDraft } from "@/server/domain/drafts/start-draft";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function createLeagueAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "");
  const rosterSize = Number(formData.get("rosterSize") ?? 8);
  const isPrivate = formData.get("isPrivate") === "on";
  const redraftPolicyRaw = formData.get("redraftPolicy");
  const redraftPolicy =
    redraftPolicyRaw === "keeper" || redraftPolicyRaw === "admin_choice_per_cycle" || redraftPolicyRaw === "full_redraft"
      ? redraftPolicyRaw
      : undefined;
  const homeStateRaw = String(formData.get("homeState") ?? "");
  const homeState = homeStateRaw || undefined;
  const chamberScopeRaw = formData.get("chamberScope");
  const chamberScope = chamberScopeRaw === "house" || chamberScopeRaw === "senate" ? chamberScopeRaw : "all";

  let leagueId: string;
  try {
    const league = await createLeague(session.user.activeTenantId, session.user.id, {
      name,
      rosterSize,
      isPrivate,
      redraftPolicy,
      homeState,
      chamberScope,
    });
    leagueId = league.id;
  } catch (err) {
    redirect(`/leagues?error=${encodeURIComponent(errMsg(err))}`);
  }

  redirect(`/leagues/${leagueId}`);
}

export async function joinLeagueAction(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  await joinLeague(session.user.activeTenantId, leagueId, session.user.id);
  redirect(`/leagues/${leagueId}`);
}

export async function inviteOwnerAction(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  try {
    await inviteOwnerByEmail(session.user.activeTenantId, leagueId, email);
  } catch (err) {
    redirect(`/leagues/${leagueId}?error=${encodeURIComponent(errMsg(err))}`);
  }

  redirect(`/leagues/${leagueId}`);
}

export async function startSeasonAction(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const electionCycle = String(formData.get("electionCycle") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const redraftChoiceRaw = formData.get("redraftChoice");
  const redraftChoice = redraftChoiceRaw === "keeper" || redraftChoiceRaw === "full_redraft" ? redraftChoiceRaw : undefined;

  let seasonId: string;
  try {
    const season = await startSeason(session.user.activeTenantId, leagueId, {
      electionCycle,
      startDate,
      endDate,
      redraftChoice,
    });
    seasonId = season.id;
  } catch (err) {
    redirect(`/leagues/${leagueId}?error=${encodeURIComponent(errMsg(err))}`);
  }

  redirect(`/leagues/${leagueId}/seasons/${seasonId}`);
}

export async function closeSeasonAction(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");

  try {
    await closeSeason(session.user.activeTenantId, seasonId, session.user.id);
  } catch (err) {
    redirect(`/leagues/${leagueId}/seasons/${seasonId}?error=${encodeURIComponent(errMsg(err))}`);
  }

  redirect(`/leagues/${leagueId}/seasons/${seasonId}`);
}

export async function startDraftAction(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");

  let draftEventId: string;
  try {
    const draftEvent = await startDraft(session.user.activeTenantId, seasonId);
    draftEventId = draftEvent.id;
  } catch (err) {
    redirect(`/leagues/${leagueId}/seasons/${seasonId}?error=${encodeURIComponent(errMsg(err))}`);
  }

  redirect(`/draft/${draftEventId}?leagueId=${leagueId}`);
}
