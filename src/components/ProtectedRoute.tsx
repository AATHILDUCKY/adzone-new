"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Layout from "./Layout";
import { AppLoadingScreen } from "./AppLoadingScreen";
import { canAccessRoute, getDefaultRoute } from "../lib/route-access";
import { useAppSession } from "./AppSessionProvider";

type ProtectedRouteProps = {
  routePath: string;
  accessPath?: string;
  children: ReactNode;
};

export function ProtectedRoute({ routePath, accessPath, children }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, loading, logout } = useAppSession();
  const pathToCheck = accessPath ?? routePath;

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!canAccessRoute(user.role, pathToCheck)) {
      router.replace(getDefaultRoute(user.role));
    }
  }, [loading, pathToCheck, router, user]);

  if (loading || !user || !canAccessRoute(user.role, pathToCheck)) {
    return <AppLoadingScreen />;
  }

  return (
    <Layout user={user} onLogout={logout}>
      {children}
    </Layout>
  );
}
