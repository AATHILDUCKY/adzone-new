"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "../lib/utils";

type AppSessionContextValue = {
  user: any;
  loading: boolean;
  setUser: (user: any) => void;
  logout: () => void;
};

const AppSessionContext = createContext<AppSessionContextValue | undefined>(undefined);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("adzone_token");
    if (!token) {
      setLoading(false);
      return;
    }

    apiFetch("/auth/me")
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("adzone_token");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const value = useMemo<AppSessionContextValue>(
    () => ({
      user,
      loading,
      setUser,
      logout: () => {
        localStorage.removeItem("adzone_token");
        setUser(null);
      },
    }),
    [loading, user],
  );

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }

  return context;
}
