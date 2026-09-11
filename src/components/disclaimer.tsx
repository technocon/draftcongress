/**
 * SRD §9's required disclaimer copy. Platform-level compliance copy —
 * SRD §9 explicitly says tenant admins must NOT be able to alter this
 * independently of platform legal review, even on a fully white-labeled
 * instance, so this stays a shared, non-configurable component rather
 * than per-tenant content.
 */
export function Disclaimer({ variant = "full" }: { variant?: "full" | "compact" }) {
  if (variant === "compact") {
    return (
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Draft Congress is a game layered on public data — not a prediction, forecast, or endorsement of any
        candidate or party.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-4 text-sm text-neutral-700 dark:text-neutral-300">
      <p className="font-medium">This is a game, not a forecast.</p>
      <p className="mt-1">
        Draft Congress scores fantasy rosters using real, public legislative and electoral data, but it does not
        predict election outcomes and does not represent an endorsement or opinion of any candidate, party, or
        legislative action. No cash stakes, entry fees, or wagering are offered anywhere on this platform.
      </p>
    </div>
  );
}
