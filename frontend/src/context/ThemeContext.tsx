"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { applyMode, Mode } from "@cloudscape-design/global-styles";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "light", toggle: () => {} });

export const STORAGE_KEY = "r53-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Sync with the pre-paint value set by the inline script in <head>.
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";
    setTheme(stored);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Cloudscape components read their own root class rather than ours, so the
    // theme has to be mirrored onto them or they'd stay light in dark mode.
    applyMode(theme === "dark" ? Mode.Dark : Mode.Light);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
