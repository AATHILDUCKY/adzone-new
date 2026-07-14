"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Login from "../views/Login";
import { getDefaultRoute } from "../lib/route-access";
import { AppLoadingScreen } from "./AppLoadingScreen";
import { useAppSession } from "./AppSessionProvider";

export function LoginRoute() {
  const router = useRouter();
  const { user, loading, setUser } = useAppSession();

  useEffect(() => {
    if (!loading && user) {
      router.replace(getDefaultRoute(user.role));
    }
  }, [loading, router, user]);

  if (loading || user) {
    return <AppLoadingScreen />;
  }

  return (
    <Login
      onLogin={(nextUser) => {
        setUser(nextUser);
        router.replace(getDefaultRoute(nextUser?.role));
      }}
    />
  );
}
