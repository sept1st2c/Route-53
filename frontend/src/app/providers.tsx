"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { DrawerProvider } from "@/context/DrawerContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <DrawerProvider>{children}</DrawerProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
