"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Defers mounting children until the browser is idle (or a short timeout
 * on browsers without requestIdleCallback), so their JS, effects and fetches
 * never compete with hydration and first paint.
 *
 * Use ONLY for components that render nothing on first paint (banners that
 * need a network verdict, pollers, reporters): deferring something visible
 * would hold its content out of the initial render for no benefit.
 *
 * Renders children synchronously on the server only when `ssr` is set —
 * the default client-only mode renders nothing until idle, which also
 * keeps those components' payload out of the critical hydration path.
 */
export function IdleMount({
  children,
  timeout = 4000,
}: {
  children: ReactNode;
  /** Max ms to wait for a genuinely idle frame before mounting anyway. */
  timeout?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(load, { timeout });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(load, Math.min(timeout, 2000));
    return () => clearTimeout(t);
  }, [timeout]);

  if (!ready) return null;
  return <>{children}</>;
}
