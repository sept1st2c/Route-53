"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { useHotkey } from "@/lib/useHotkey";
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal";

interface ShortcutsCtx {
  openHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsCtx>({ openHelp: () => {} });
export const useShortcuts = () => useContext(ShortcutsContext);

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  // "?" toggles the shortcuts reference from anywhere.
  useHotkey("?", () => setHelpOpen((o) => !o));
  // Alt+S focuses the top search bar, matching the "[Alt+S]" hint already shown there.
  useHotkey("s", () => document.getElementById("global-search-input")?.focus(), {
    alt: true,
    allowInInputs: true,
  });
  // "/" focuses the current page's filter box (hosted zones list, records list, …).
  useHotkey("/", () => document.getElementById("page-filter-input")?.focus());

  return (
    <ShortcutsContext.Provider value={{ openHelp }}>
      {children}
      <KeyboardShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </ShortcutsContext.Provider>
  );
}
