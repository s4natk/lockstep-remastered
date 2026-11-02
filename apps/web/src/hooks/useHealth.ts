"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConnectionState } from "../lib/connection";
import { fetchWorkerHealth, type WorkerHealth } from "../lib/worker";

export type { ConnectionState };

const POLL_MS = 60_000;

export function useHealth() {
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [socketReachable, setSocketReachable] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setChecking(true);
    const next = await fetchWorkerHealth();
    setHealth(next);
    setChecking(false);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    const timer = window.setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  let state: ConnectionState;
  if (health?.openai) {
    state = health.openai.mode;
  } else if (health || socketReachable) {
    state = "reachable";
  } else {
    state = checking ? "checking" : "offline";
  }

  return {
    health,
    state,
    refresh,
    /** A WebSocket session opened, so the Worker is up even if `/health` was blocked (for example by CORS). */
    markReachable: useCallback(() => setSocketReachable(true), []),
  };
}
