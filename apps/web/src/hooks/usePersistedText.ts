"use client";

import { useEffect, useState } from "react";

import { readText, writeText } from "../lib/storage";

export function usePersistedText(key: string): [string, (value: string) => void, boolean] {
  const [value, setValue] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(readText(key) ?? "");
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = window.setTimeout(() => writeText(key, value), 400);
    return () => window.clearTimeout(timer);
  }, [key, ready, value]);

  return [value, setValue, ready];
}
