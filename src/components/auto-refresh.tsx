"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the server every `intervalMs` via router.refresh() so draft state
 * (picks, whose turn it is, auto-picks resolved by getDraftState's lazy
 * check) stays current without the client doing anything — SRD B5's "live"
 * roster tracker, implemented as polling rather than push since Phase 1
 * has no websocket infra (see the architecture plan §5/§8).
 */
export function AutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
