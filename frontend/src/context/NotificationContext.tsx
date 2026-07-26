"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export type FlashType = "success" | "error" | "info" | "warning";

export interface Flash {
  id: string;
  type: FlashType;
  header?: string;
  content: string;
}

interface NotificationCtx {
  flashes: Flash[];
  notify: (f: Omit<Flash, "id">) => void;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationCtx>(null as unknown as NotificationCtx);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [flashes, setFlashes] = useState<Flash[]>([]);

  const dismiss = useCallback((id: string) => {
    setFlashes((fs) => fs.filter((f) => f.id !== id));
  }, []);

  const notify = useCallback(
    (f: Omit<Flash, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setFlashes((fs) => [...fs, { ...f, id }]);
      if (f.type === "success" || f.type === "info") {
        setTimeout(() => dismiss(id), 6000);
      }
    },
    [dismiss]
  );

  return (
    <NotificationContext.Provider value={{ flashes, notify, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotify = () => useContext(NotificationContext);
