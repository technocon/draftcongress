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
      <p className="text-xs text-[var(--color-ink-soft)]">
        Draft Congress is a game layered on public data — not a prediction, forecast, or endorsement of any
        candidate or party.
      </p>
    );
  }

  return (
    <div className="rc-card border-l-4 border-l-[var(--color-accent)] bg-[var(--color-paper-muted)] p-4 text-sm text-[var(--color-ink-soft)]">
      <p className="section-label">This is a game, not a forecast.</p>
      <p className="mt-1">
        Draft Congress scores fantasy rosters using real, public legislative and electoral data, but it does not
        predict election outcomes and does not represent an endorsement or opinion of any candidate, party, or
        legislative action. No cash stakes, entry fees, or wagering are offered anywhere on this platform.
      </p>
    </div>
  );
}
