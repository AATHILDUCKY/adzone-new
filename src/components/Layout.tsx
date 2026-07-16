import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ReceiptText,
  Package, 
  Users, 
  Truck, 
  BarChart3, 
  LogOut, 
  Bell,
  CheckCheck,
  Printer,
  Menu,
  X,
  Store,
  AlertTriangle,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { apiFetch, cn } from "../lib/utils";
import { useShopProfile } from "./ShopProfileProvider";
import { OutletContextProvider } from "./OutletContext";

export default function Layout({ user, onLogout, children }: { user: any; onLogout: () => void; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuditor = user.role === "AUDITOR";
  const canAccessPos = user.role === "ADMIN" || user.role === "CASHIER";
  const canAccessOrders = user.role === "ADMIN" || user.role === "CASHIER" || user.role === "AUDITOR";
  const canAccessInventory = user.role === "ADMIN" || user.role === "INVENTORY_MANAGER";
  const canAccessCustomers = user.role === "ADMIN" || user.role === "CASHIER";
  const canAccessSuppliers = user.role === "ADMIN" || user.role === "INVENTORY_MANAGER";
  const canAccessReports = true;
  const canAccessAuditLogs = user.role === "ADMIN" || user.role === "AUDITOR";
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [notificationData, setNotificationData] = useState<{
    unreadCount: number;
    items: Array<{
      id: string;
      type: "LOW_STOCK";
      status: string;
      title: string;
      message: string;
      createdAt: string;
      productId: string;
      productName: string;
      currentStock: number;
      thresholdValue: number;
    }>;
  }>({ unreadCount: 0, items: [] });
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const { shopProfile, setShopProfile } = useShopProfile();

  const loadPrinters = useCallback(async () => {
    if (!canAccessPos) return;
    try {
      const response = await apiFetch("/printers");
      setPrinters(Array.isArray(response.printers) ? response.printers : []);
    } catch {
      setPrinters([]);
    }
  }, [canAccessPos]);

  const handlePrinterChange = async (printerName: string) => {
    setPrinterLoading(true);
    try {
      const updatedProfile = await apiFetch("/printer-selection", {
        method: "PATCH",
        body: JSON.stringify({ printerName }),
      });
      setShopProfile(updatedProfile);
      toast.success(printerName ? `Printer changed to ${printerName}` : "Browser printing selected");
    } catch (error: any) {
      toast.error(error.message || "Failed to change printer");
    } finally {
      setPrinterLoading(false);
    }
  };

  const loadNotifications = useCallback(async () => {
    const response = await apiFetch("/notifications?status=ALL&limit=15");
    setNotificationData(response);
  }, []);

  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    ...(canAccessPos ? [{ name: "POS Billing", path: "/pos", icon: ShoppingCart }] : []),
    ...(canAccessOrders ? [{ name: "Orders", path: "/orders", icon: ReceiptText }] : []),
    ...(canAccessInventory ? [{ name: "Inventory", path: "/inventory", icon: Package }] : []),
    ...(canAccessCustomers ? [{ name: "Customers", path: "/customers", icon: Users }] : []),
    ...(canAccessSuppliers ? [{ name: "Suppliers", path: "/suppliers", icon: Truck }] : []),
    ...(canAccessReports ? [{ name: "Reports", path: "/reports", icon: BarChart3 }] : []),
    ...(canAccessAuditLogs ? [{ name: "Audit Trail", path: "/audit-logs", icon: ShieldCheck }] : []),
    ...(user.role === "ADMIN" ? [{ name: "Users", path: "/users", icon: Users }] : []),
    ...(user.role === "ADMIN" ? [{ name: "Shop Profile", path: "/settings", icon: Store }] : []),
  ];
  const currentPage = navItems.find((item) => pathname === item.path)?.name ?? "Dashboard";
  const currentDateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const mobilePrimaryNav = [
    { name: isAuditor ? "Audit" : "Home", path: isAuditor ? "/audit-logs" : "/", icon: isAuditor ? ShieldCheck : LayoutDashboard },
    ...(canAccessPos ? [{ name: "POS", path: "/pos", icon: ShoppingCart }] : []),
    ...(canAccessOrders ? [{ name: "Orders", path: "/orders", icon: ReceiptText }] : []),
    ...(canAccessReports ? [{ name: "Reports", path: "/reports", icon: BarChart3 }] : []),
    ...(canAccessInventory ? [{ name: "Stock", path: "/inventory", icon: Package }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem("adzone_token");
    onLogout();
    router.push("/login");
  };

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    if (isAuditor) {
      setNotificationLoading(false);
      return;
    }

    let alive = true;

    const loadNotificationsSafe = async () => {
      try {
        const response = await apiFetch("/notifications?status=ALL&limit=15");
        if (!alive) {
          return;
        }
        setNotificationData(response);
      } catch {
        if (!alive) {
          return;
        }
      } finally {
        if (alive) {
          setNotificationLoading(false);
        }
      }
    };

    void loadNotificationsSafe();
    const interval = window.setInterval(() => {
      void loadNotificationsSafe();
    }, 45_000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [isAuditor]);

  useEffect(() => {
    if (!isNotificationOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationMenuRef.current) {
        return;
      }
      if (!notificationMenuRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isNotificationOpen]);

  const markNotificationRead = async (id: string) => {
    let wasUnread = false;
    setNotificationData((current) => {
      const notification = current.items.find((item) => item.id === id);
      if (!notification || notification.status !== "UNREAD") {
        return current;
      }

      wasUnread = true;
      return {
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((item) => (item.id === id ? { ...item, status: "READ" } : item)),
      };
    });

    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // Restore latest server state if write fails after optimistic update.
      if (wasUnread) {
        try {
          await loadNotifications();
        } catch {
          // Keep UI responsive if refresh fails.
        }
      }
    }
  };

  const markAllNotificationsRead = async () => {
    const hadUnread = notificationData.unreadCount > 0;
    setNotificationData((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({ ...item, status: item.status === "UNREAD" ? "READ" : item.status })),
    }));

    try {
      await apiFetch("/notifications/read-all", { method: "PATCH" });
    } catch {
      // Restore latest server state if write fails after optimistic update.
      if (hadUnread) {
        try {
          await loadNotifications();
        } catch {
          // Silent fallback to avoid interrupting the user flow.
        }
      }
    }
  };

  const handleNotificationToggle = () => {
    const nextOpenState = !isNotificationOpen;
    setIsNotificationOpen(nextOpenState);
  };

  return (
    <div className="app-shell flex h-screen overflow-hidden pb-20 lg:pb-0">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[340px] transform border-r border-white/70 bg-white/90 shadow-2xl shadow-zinc-900/8 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:w-72 lg:max-w-none lg:translate-x-0 lg:shadow-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-20 items-center justify-between border-b border-zinc-100 px-5 lg:px-6">
            <div className="flex min-w-0 items-center">
            {shopProfile.logoUrl ? (
              <img
                src={shopProfile.logoUrl}
                alt={`${shopProfile.shopName} logo`}
                className="h-11 w-11 rounded-2xl border border-zinc-200 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-200">
                <Printer size={20} />
              </div>
            )}
              <div className="ml-3 min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight text-zinc-900">{shopProfile.shopName}</span>
              {shopProfile.tagline ? <span className="block truncate text-xs text-zinc-500">{shopProfile.tagline}</span> : <span className="block truncate text-xs text-zinc-400">Print business workspace</span>}
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-full p-2 text-zinc-400 transition-all hover:bg-zinc-100 hover:text-zinc-900 lg:hidden"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>

          <div className="hidden px-4 pt-4 lg:block">
            <div className="rounded-[26px] border border-orange-100 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_58%,#fffaf5_100%)] p-4 shadow-[0_18px_45px_-34px_rgba(251,146,60,0.5)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-700">Current Workspace</p>
              <p className="mt-2 text-lg font-bold tracking-tight text-zinc-950">{currentPage}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Fast access to billing, reporting, inventory, and daily operations.
              </p>
            </div>
          </div>

          <nav className="hidden min-h-0 flex-1 overflow-y-auto space-y-1 px-4 py-6 lg:block">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.name}
                  href={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "group flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    isActive 
                      ? "bg-zinc-900 text-white shadow-lg shadow-zinc-900/10" 
                      : "text-zinc-500 hover:bg-white hover:text-zinc-900 hover:shadow-sm"
                  )}
                >
                  <Icon className={cn("mr-3 h-5 w-5 transition-colors", isActive ? "text-white" : "text-zinc-400 group-hover:text-orange-500")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1 overflow-y-auto px-4 py-5 lg:hidden">
            <div className="grid grid-cols-2 gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                  const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    href={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "group rounded-2xl border px-4 py-4 transition-all",
                      isActive
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-lg shadow-zinc-200"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-orange-200 hover:bg-orange-50",
                    )}
                  >
                    <div className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl",
                      isActive ? "bg-white/15 text-white" : "bg-white text-zinc-500",
                    )}>
                      <Icon size={20} />
                    </div>
                    <p className={cn("mt-3 text-sm font-semibold", isActive ? "text-white" : "text-zinc-900")}>
                      {item.name}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 border-t border-zinc-100 p-4">
            <div className="rounded-[26px] border border-zinc-200/80 bg-zinc-50/90 p-3.5">
              <div className="flex items-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-bold text-white shadow-sm">
                {user.name[0]}
                </div>
                <div className="ml-3 overflow-hidden">
                  <p className="truncate text-sm font-semibold text-zinc-900">{user.name}</p>
                  <p className="truncate text-xs text-zinc-500">{user.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-3 flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-red-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-50"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/70 bg-white/72 px-4 backdrop-blur-xl lg:h-20 lg:px-8 xl:px-10">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="rounded-full p-2 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-900 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>

          <div className="min-w-0 lg:hidden">
            <p className="truncate text-sm font-bold text-zinc-900">{shopProfile.shopName}</p>
            <p className="truncate text-[11px] uppercase tracking-[0.18em] text-zinc-400">{currentPage}</p>
          </div>

          <div className="hidden min-w-0 lg:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-600/80">{currentDateLabel}</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-zinc-950">{currentPage}</h1>
          </div>
          
          <div ref={notificationMenuRef} className="relative ml-auto flex items-center gap-3">
            {canAccessPos ? (
              <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-2.5 py-2 shadow-sm">
                <Printer size={17} className="shrink-0 text-orange-600" />
                <span className="sr-only">Invoice printer</span>
                <select
                  aria-label="Invoice printer"
                  value={shopProfile.printerName || ""}
                  disabled={printerLoading}
                  onChange={(event) => void handlePrinterChange(event.target.value)}
                  className="w-[112px] min-w-0 bg-transparent text-xs font-semibold text-zinc-700 outline-none sm:w-[160px] lg:w-[190px]"
                >
                  <option value="">Browser print</option>
                  {shopProfile.printerName && !printers.includes(shopProfile.printerName) ? (
                    <option value={shopProfile.printerName}>{shopProfile.printerName} (offline)</option>
                  ) : null}
                  {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
                </select>
              </label>
            ) : null}
            <div className="hidden rounded-2xl border border-white/80 bg-white/80 px-4 py-2 shadow-sm lg:block">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Signed in as</p>
              <p className="text-sm font-semibold text-zinc-900">{user.name}</p>
            </div>
            {!isAuditor ? (
              <>
                <button
                  onClick={handleNotificationToggle}
                  type="button"
                  aria-label={`Notifications${notificationData.unreadCount ? `, ${notificationData.unreadCount} unread` : ""}`}
                  aria-expanded={isNotificationOpen}
                  className="relative rounded-2xl border border-white/80 bg-white/80 p-2.5 text-zinc-400 shadow-sm transition-all hover:-translate-y-0.5 hover:text-zinc-900"
                >
                  <Bell size={20} />
                  {notificationData.unreadCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {notificationData.unreadCount > 9 ? "9+" : notificationData.unreadCount}
                    </span>
                  ) : null}
                </button>

                {isNotificationOpen && (
              <div className="fixed inset-x-3 top-[4.5rem] z-[70] overflow-hidden rounded-3xl border border-zinc-200 bg-white/95 shadow-2xl backdrop-blur-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[360px] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl lg:absolute lg:inset-x-auto lg:right-0 lg:top-14 lg:w-[360px]">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Notifications</p>
                    <p className="text-xs text-zinc-500">{notificationData.unreadCount} unread</p>
                  </div>
                  <button
                    onClick={() => void markAllNotificationsRead()}
                    type="button"
                    disabled={notificationData.unreadCount === 0}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 disabled:cursor-default disabled:opacity-40"
                  >
                    <CheckCheck size={14} />
                    Mark all read
                  </button>
                </div>

                <div className="max-h-[min(68vh,420px)] overflow-y-auto p-2 sm:max-h-[360px]">
                  {notificationLoading ? (
                    <div className="rounded-xl px-3 py-6 text-center text-sm text-zinc-500">Loading notifications...</div>
                  ) : notificationData.items.length ? (
                    notificationData.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          void markNotificationRead(item.id);
                          router.push("/inventory");
                          setIsNotificationOpen(false);
                        }}
                        className={cn(
                          "mb-2 w-full rounded-xl border px-3 py-3 text-left transition-all",
                          item.status === "UNREAD"
                            ? "border-orange-200 bg-orange-50/60 hover:bg-orange-50"
                            : "border-zinc-200 bg-white hover:bg-zinc-50",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("mt-0.5 rounded-lg p-1.5", item.status === "UNREAD" ? "bg-orange-100 text-orange-700" : "bg-zinc-100 text-zinc-600")}>
                            <AlertTriangle size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900">{item.title}</p>
                            <p className="mt-1 text-xs text-zinc-600">{item.message}</p>
                            <p className="mt-1 text-[11px] text-zinc-400">{new Date(item.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl px-3 py-6 text-center text-sm text-zinc-500">No notifications right now.</div>
                  )}
                </div>
              </div>
                )}
              </>
            ) : null}
          </div>
        </header>

        <main className={cn(
          "flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8 xl:px-10",
          isAuditor && "px-3 pt-4 sm:px-5 sm:pt-5",
        )}>
          <div className="mx-auto w-full max-w-[1600px] min-h-full">
            <OutletContextProvider value={{ user }}>
              {children}
            </OutletContextProvider>
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden">
        <div className={cn("grid gap-1", mobilePrimaryNav.length + 1 >= 5 ? "grid-cols-5" : "grid-cols-4")}>
          {mobilePrimaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.name}
                href={item.path}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold transition-all",
                  isActive ? "bg-orange-50 text-orange-600" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <Icon size={18} />
                <span className="mt-1">{item.name}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-semibold text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Menu size={18} />
            <span className="mt-1">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
