"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export type DrawerKey = "help" | "tools" | "split";
export type SplitPosition = "side" | "bottom";
export type SplitData = {
  count: number;
  detail: ReactNode | null;
  /** Singular noun for the selection count, e.g. "hosted zone" or "record". */
  noun?: string;
  /** Heading shown when exactly one item is selected, e.g. "Record details". */
  detailTitle?: string;
};

interface DrawerCtx {
  open: Record<DrawerKey, boolean>;
  toggle: (id: DrawerKey) => void;
  close: (id: DrawerKey) => void;
  splitPosition: SplitPosition;
  setSplitPosition: (p: SplitPosition) => void;
  splitData: SplitData;
  setSplitData: (d: SplitData) => void;
}

const DrawerContext = createContext<DrawerCtx | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Record<DrawerKey, boolean>>({ help: false, tools: false, split: false });
  const [splitPosition, setSplitPosition] = useState<SplitPosition>("side");
  const [splitData, setSplitDataState] = useState<SplitData>({ count: 0, detail: null });

  const toggle = useCallback((id: DrawerKey) => setOpen((o) => ({ ...o, [id]: !o[id] })), []);
  const close = useCallback((id: DrawerKey) => setOpen((o) => ({ ...o, [id]: false })), []);
  const setSplitData = useCallback((d: SplitData) => setSplitDataState(d), []);

  return (
    <DrawerContext.Provider value={{ open, toggle, close, splitPosition, setSplitPosition, splitData, setSplitData }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}
