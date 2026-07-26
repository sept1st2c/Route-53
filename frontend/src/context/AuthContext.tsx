"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { authService } from "@/lib/services";
import { setToken, clearToken, hasToken } from "@/lib/api";
import type { User } from "@/types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount if a token is present.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!hasToken()) {
        setLoading(false);
        return;
      }
      try {
        const u = await authService.me();
        if (active) setUser(u);
      } catch {
        clearToken();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const token = await authService.login(email, password);
    setToken(token);
    const u = await authService.me();
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const token = await authService.register(email, password, fullName);
    setToken(token);
    const u = await authService.me();
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* ignore network errors on logout */
    }
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
