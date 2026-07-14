export const routeAccessByRole: Record<string, string[]> = {
  ADMIN: ["/", "/pos", "/orders", "/inventory", "/customers", "/suppliers", "/reports", "/users", "/settings", "/audit-logs"],
  CASHIER: ["/", "/pos", "/orders", "/customers", "/reports"],
  INVENTORY_MANAGER: ["/", "/inventory", "/suppliers", "/reports"],
  AUDITOR: ["/", "/orders", "/reports", "/audit-logs"],
};

export function canAccessRoute(role: string | undefined, path: string) {
  if (!role) {
    return false;
  }

  return routeAccessByRole[role]?.includes(path) ?? false;
}

export function getDefaultRoute(role: string | undefined) {
  if (!role) {
    return "/login";
  }

  return role === "AUDITOR" ? "/audit-logs" : "/";
}
