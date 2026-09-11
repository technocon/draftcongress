import type { $Enums } from "@prisma/client";

export type EventCategory = "legislative" | "electoral";

const LEGISLATIVE_EVENT_TYPES: $Enums.ScoringEventType[] = [
  "bill_passed",
  "bill_sponsored",
  "vote_cast",
  "committee_action",
];

/** Which half of SRD §6.4's legislative_weight/electoral_weight split an event type falls into. */
export function categoryFor(eventType: $Enums.ScoringEventType): EventCategory {
  return LEGISLATIVE_EVENT_TYPES.includes(eventType) ? "legislative" : "electoral";
}
