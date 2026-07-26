"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Fires `handler` when `key` is pressed, skipping form fields unless `allowInInputs` is set. */
export function useHotkey(
  key: string,
  handler: () => void,
  opts: { alt?: boolean; allowInInputs?: boolean; enabled?: boolean } = {}
) {
  const { alt = false, allowInInputs = false, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (e.altKey !== alt) return;
      if (!allowInInputs && isTypingTarget(e.target)) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, alt, allowInInputs, enabled]);
}
