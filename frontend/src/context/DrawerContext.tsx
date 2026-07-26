"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

/** Matches Cloudscape AppLayout's `splitPanelPreferences.position`. */
export type SplitPosition = "side" | "bottom";

/** One label/value row rendered in the split panel by Cloudscape KeyValuePairs. */
export type SplitField = { label: string; value: ReactNode };

export type SplitData = {
  /** How many rows are selected in the page's table. */
  count: number;
  /** Preferred: laid out by KeyValuePairs, which reflows into columns when docked at the bottom. */
  fields?: SplitField[];
  /** Escape hatch for content that isn't a simple label/value list. */
  detail?: ReactNode | null;
  /** Singular noun for the selection count, e.g. "hosted zone" or "record". */
  noun?: string;
  /** Heading shown when exactly one item is selected, e.g. "Record details". */
  detailTitle?: string;
};

interface DrawerCtx {
  splitOpen: boolean;
  setSplitOpen: (open: boolean) => void;
  splitPosition: SplitPosition;
  setSplitPosition: (p: SplitPosition) => void;
  splitData: SplitData;
  setSplitData: (d: SplitData) => void;
}

const DrawerContext = createContext<DrawerCtx | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitPosition, setSplitPosition] = useState<SplitPosition>("side");
  const [splitData, setSplitDataState] = useState<SplitData>({ count: 0 });

  const setSplitData = useCallback((d: SplitData) => setSplitDataState(d), []);

  return (
    <DrawerContext.Provider
      value={{ splitOpen, setSplitOpen, splitPosition, setSplitPosition, splitData, setSplitData }}
    >
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}
