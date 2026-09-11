"use client";

import { useEffect } from "react";

/**
 * Restores scroll position on back/forward. App Router leaves this flag at
 * its default "auto", but an early explicit set keeps it that way even if a
 * future dependency flips it. Push navigations still jump to top (Next's
 * default) — only back/forward restore where you were, e.g. returning to
 * /browse from a resource page.
 */
export default function ScrollRestoration() {
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "auto";
  }, []);
  return null;
}
