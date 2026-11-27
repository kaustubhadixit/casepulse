"use client";

import { useEffect, useState } from "react";

export interface HashRoute {
  path: string[];
  query: URLSearchParams;
  hash: string;
}

export function parseHash(hash: string): HashRoute {
  const raw = hash.replace(/^#\/?/, "");
  const [p, q = ""] = raw.split("?");
  return { path: p.split("/").filter(Boolean), query: new URLSearchParams(q), hash: `#${raw}` };
}

/** Client-side hash router: all views live inside the single `/` route. */
export function useHashRoute(): HashRoute | null {
  const [route, setRoute] = useState<HashRoute | null>(null);
  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

/** Programmatic navigation, e.g. navigate("/litigations?status=Active"). */
export function navigate(to: string) {
  window.location.hash = to.startsWith("#") ? to : `#${to}`;
}

export function goBackOrHome() {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
}
