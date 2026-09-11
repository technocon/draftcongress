import type { ChamberRef } from "./port";

/**
 * Maps a domain Chamber row to the "house" | "senate" code the legislative
 * adapters key their queries on. Phase 1 only ever seeds these two exact
 * chamber names (see prisma/seed.ts) — this is a deliberately small,
 * explicit mapping rather than a guess, so it fails loudly (not silently
 * wrong) the moment a chamber outside U.S. Congress is introduced (Epic F).
 */
export function chamberRefFor(chamber: { name: string }): ChamberRef {
  if (chamber.name === "U.S. House of Representatives") return "house";
  if (chamber.name === "U.S. Senate") return "senate";
  throw new Error(
    `No legislative-adapter chamber mapping for "${chamber.name}" — the fixture/real adapters only know "house"/"senate" today (Epic F: non-Congress bodies need their own adapter or mapping).`
  );
}
