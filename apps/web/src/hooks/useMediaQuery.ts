"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const COMPACT_QUERY = "(max-width: 959px)";
export const MOBILE_QUERY = "(max-width: 767px)";
export const MEDIUM_QUERY = "(max-width: 1199px)";
