import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, cn } from "../lib/utils";
import { 
  TrendingUp, 
  ShoppingBag, 
  AlertTriangle, 
  PackageCheck,
  ArrowUpRight,
  ArrowDownRight,
  BellRing,
  Mail,
  Send,
  Trash2,
  UserPlus,
  CheckCircle2,
  XCircle,
  PackageSearch,
  ChevronRight,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { toast } from "sonner";
import { useOutletContext } from "../components/OutletContext";

type Recipient = {
  id: string;
  name: string;
  email: string;
  isEnabled: boolean;
  notificationType: string;
  createdAt: string;
  updatedAt: string;
};

type NotificationResponse = {
  recipients: Recipient[];
  mail: {
    enabled: boolean;
    from: string | null;
    host: string | null;
  };
};

function formatCurrency(value: number) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTrend(value: number) {
  const normalized = Number(value || 0);
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(1)}%`;
}

export default function Dashboard() {
  const { user } = useOutletContext<{ user: any }>();
  const isAdmin = user?.role === "ADMIN";
  const canManageInventory = user?.role === "ADMIN" || user?.role === "INVENTORY_MANAGER";
  const [stats, setStats] = useState<any>(null);
  const [notificationData, setNotificationData] = useState<NotificationResponse | null>(null);
  const [recipientForm, setRecipientForm] = useState({ name: "", email: "" });
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const requests = [apiFetch("/dashboard/stats")];
        if (isAdmin) {
          requests.push(apiFetch("/notifications/recipients"));
        }

        const [statsResponse, notificationResponse] = await Promise.all(requests);
        setStats(statsResponse);
        if (notificationResponse) {
          setNotificationData(notificationResponse as NotificationResponse);
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to load dashboard");
      }
    };

    void load();
  }, [isAdmin]);

  const refreshNotificationRecipients = async () => {
    if (!isAdmin) {
      return;
    }

    try {
      const data = await apiFetch("/notifications/recipients");
      setNotificationData(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load notification recipients");
    }
  };

  const handleAddRecipient = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingRecipient(true);

    try {
      await apiFetch("/notifications/recipients", {
        method: "POST",
        body: JSON.stringify({
          ...recipientForm,
          isEnabled: true,
        }),
      });
      setRecipientForm({ name: "", email: "" });
      await refreshNotificationRecipients();
      toast.success("Notification recipient added");
    } catch (error: any) {
      toast.error(error.message || "Failed to add recipient");
    } finally {
      setIsSavingRecipient(false);
    }
  };

  const handleToggleRecipient = async (recipient: Recipient) => {
    try {
      await apiFetch(`/notifications/recipients/${recipient.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: recipient.name,
          email: recipient.email,
          isEnabled: !recipient.isEnabled,
        }),
      });
      await refreshNotificationRecipients();
      toast.success(recipient.isEnabled ? "Recipient disabled" : "Recipient enabled");
    } catch (error: any) {
      toast.error(error.message || "Failed to update recipient");
    }
  };

  const handleDeleteRecipient = async (recipient: Recipient) => {
    if (!window.confirm(`Remove ${recipient.email} from inventory notifications?`)) {
      return;
    }

    try {
      await apiFetch(`/notifications/recipients/${recipient.id}`, {
        method: "DELETE",
      });
      await refreshNotificationRecipients();
      toast.success("Recipient removed");
    } catch (error: any) {
      toast.error(error.message || "Failed to remove recipient");
    }
  };

  if (!stats) {
    return (
      <div className="loading-panel mx-auto mt-10">
        <div className="loading-spinner" />
        <div className="space-y-1 text-center">
          <p className="eyebrow-label">Dashboard</p>
          <h2 className="text-xl font-bold text-zinc-950">Loading business overview</h2>
          <p className="text-sm text-zinc-500">Preparing current sales, profit, and inventory insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="space-y-5">
            <div className="hero-badge">Live Business Overview</div>
            <div>
              <h1 className="page-title">A clearer view of today’s business performance</h1>
              <p className="page-copy mt-3">
                Live revenue, profit, margin, and inventory analytics based on current sales and raw-material cost snapshots.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="hero-stat">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-200">
                    <TrendingUp size={18} />
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold",
                    (stats.trends?.revenueVsYesterday ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
                  )}>
                    {(stats.trends?.revenueVsYesterday ?? 0) >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                    {formatTrend(stats.trends?.revenueVsYesterday ?? 0)}
                  </span>
                </div>
                <p className="metric-label mt-4">Today Revenue</p>
                <p className="hero-stat-value">{formatCurrency(stats.todayRevenue)}</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md shadow-emerald-200">
                    <PackageCheck size={18} />
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold",
                    (stats.trends?.profitVsYesterday ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
                  )}>
                    {(stats.trends?.profitVsYesterday ?? 0) >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                    {formatTrend(stats.trends?.profitVsYesterday ?? 0)}
                  </span>
                </div>
                <p className="metric-label mt-4">Today Profit</p>
                <p className="hero-stat-value">{formatCurrency(stats.todayProfit)}</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500 text-white shadow-md shadow-red-200">
                    <AlertTriangle size={18} />
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold",
                    stats.lowStockCount > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700",
                  )}>
                    {stats.lowStockCount > 0 ? <AlertTriangle size={12} className="mr-1" /> : <CheckCircle2 size={12} className="mr-1" />}
                    {stats.lowStockCount > 0 ? "Action needed" : "Stock healthy"}
                  </span>
                </div>
                <p className="metric-label mt-4">Low Stock Alerts</p>
                <p className="hero-stat-value">{stats.lowStockCount}</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-md shadow-blue-200">
                    <ShoppingBag size={18} />
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold",
                    (stats.trends?.salesVsYesterday ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
                  )}>
                    {(stats.trends?.salesVsYesterday ?? 0) >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                    {formatTrend(stats.trends?.salesVsYesterday ?? 0)}
                  </span>
                </div>
                <p className="metric-label mt-4">Today Sales</p>
                <p className="hero-stat-value">{stats.todaySales}</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-md shadow-rose-200">
                    <Trash2 size={18} />
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600">
                    <ArrowDownRight size={12} className="mr-1" />
                    Track
                  </span>
                </div>
                <p className="metric-label mt-4">Today Wastage Cost</p>
                <p className="hero-stat-value">{formatCurrency(stats.todayWastageCost)}</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-md shadow-violet-200">
                    <ShoppingBag size={18} />
                  </div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold",
                    (stats.weekMargin ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
                  )}>
                    {(stats.weekMargin ?? 0) >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                    {(stats.weekMargin ?? 0).toFixed(1)}% margin
                  </span>
                </div>
                <p className="metric-label mt-4">Inventory Value</p>
                <p className="hero-stat-value">{formatCurrency(stats.inventoryCostValue)}</p>
              </div>
            </div>
          </div>

          <div className="surface-card-soft p-5 sm:p-6">
            <p className="metric-label">Quick Snapshot</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Sales vs yesterday</p>
                  <p className="text-xs text-zinc-500">Short-term trading momentum</p>
                </div>
                <span className={cn("status-chip", (stats.trends?.salesVsYesterday ?? 0) >= 0 ? "text-emerald-700" : "text-red-600")}>
                  {formatTrend(stats.trends?.salesVsYesterday ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Weekly margin</p>
                  <p className="text-xs text-zinc-500">After materials, wastage, and service cost</p>
                </div>
                <span className={cn("status-chip", (stats.weekMargin ?? 0) >= 0 ? "text-orange-700" : "text-red-600")}>
                  {stats.weekMargin?.toFixed?.(1) ?? "0.0"}%
                </span>
              </div>
              <div className="rounded-2xl bg-zinc-950 px-4 py-4 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Inventory Value</p>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(stats.inventoryCostValue)}</p>
                <p className="mt-2 text-sm text-white/75">Useful for cashflow awareness and stock planning.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="panel-section lg:col-span-2">
          <div className="panel-header">
            <div>
              <p className="eyebrow-label">Sales Performance</p>
              <h3 className="mt-2 text-xl font-bold text-zinc-950">Revenue and profit trend</h3>
            </div>
            <p className="max-w-sm text-sm leading-6 text-zinc-500">
              Compare weekly movement so you can spot stronger days and margin pressure faster.
            </p>
          </div>
          <div className="panel-body">
            <div className="h-[260px] w-full sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.weeklySales}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.14}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} />
                  <Tooltip
                    contentStyle={{borderRadius: '16px', border: '1px solid #f4f4f5', boxShadow: '0 20px 50px -32px rgb(15 23 42 / 0.35)'}}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                  <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow-label">Analytics Snapshot</p>
              <h3 className="mt-2 text-xl font-bold text-zinc-950">7-day summary</h3>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <div className="surface-muted p-4">
              <p className="metric-label">7-Day Revenue</p>
              <p className="mt-2 text-xl font-bold text-zinc-900">{formatCurrency(stats.weekRevenue)}</p>
              <p className={cn("mt-2 text-xs font-semibold", (stats.trends?.revenueVsPreviousWeek ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                {formatTrend(stats.trends?.revenueVsPreviousWeek ?? 0)} vs previous 7 days
              </p>
            </div>
            <div className="surface-muted p-4">
              <p className="metric-label">7-Day Profit</p>
              <p className="mt-2 text-xl font-bold text-zinc-900">{formatCurrency(stats.weekProfit)}</p>
              <p className={cn("mt-2 text-xs font-semibold", (stats.trends?.profitVsPreviousWeek ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                {formatTrend(stats.trends?.profitVsPreviousWeek ?? 0)} vs previous 7 days
              </p>
            </div>
            <div className="surface-muted p-4">
              <p className="metric-label">7-Day Margin</p>
              <p className="mt-2 text-xl font-bold text-zinc-900">{stats.weekMargin?.toFixed?.(1) ?? "0.0"}%</p>
              <p className="mt-2 text-sm text-zinc-500">Profit after raw material, wastage, and service cost.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-section overflow-hidden">
        <div className="panel-header bg-gradient-to-r from-red-50/70 via-white to-orange-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <PackageSearch size={21} />
            </div>
            <div>
              <p className="eyebrow-label">Inventory Attention</p>
              <h3 className="mt-1 text-xl font-bold text-zinc-950">Low-stock materials</h3>
            </div>
          </div>
          {canManageInventory && (
            <Link href="/inventory" className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm transition-all hover:border-orange-200 hover:text-orange-700">
              Open inventory <ChevronRight size={14} />
            </Link>
          )}
        </div>
        <div className="panel-body">
          {stats.lowStockItems?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.lowStockItems.map((item: any) => {
                const threshold = Number(item.minimumStockThreshold || 0);
                const stock = Number(item.currentStock || 0);
                const stockPercent = threshold > 0 ? Math.max(0, Math.min(100, (stock / threshold) * 100)) : 0;
                return (
                  <div key={item.id} className="rounded-2xl border border-red-100 bg-gradient-to-br from-white to-red-50/60 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-zinc-900">{item.name}</p>
                        <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{item.sku}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">Low</span>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Available</p>
                        <p className="mt-1 text-lg font-bold text-red-600">{stock.toLocaleString()} <span className="text-xs font-semibold">{item.unitType}</span></p>
                      </div>
                      <p className="text-right text-[11px] text-zinc-500">Minimum<br/><span className="font-bold text-zinc-700">{threshold.toLocaleString()}</span></p>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-red-100">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${stockPercent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/50 px-6 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><PackageCheck size={22} /></div>
              <p className="mt-3 font-bold text-zinc-900">Inventory levels look healthy</p>
              <p className="mt-1 text-sm text-zinc-500">No active raw materials are at or below their minimum stock level.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="panel-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow-label">Top Performers</p>
              <h3 className="mt-2 text-xl font-bold text-zinc-950">Top profit products</h3>
            </div>
          </div>
          <div className="panel-body space-y-3">
            {stats.topProducts?.length ? stats.topProducts.map((product: any) => (
              <div key={product.id} className="surface-muted p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{product.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{product.quantity.toFixed?.(2) ?? product.quantity} units sold</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(product.profit)}</p>
                    <p className="text-[11px] text-zinc-500">{product.margin?.toFixed?.(1) ?? "0.0"}% margin</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="empty-state text-sm text-zinc-500">No profit data yet for this week.</div>
            )}
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-header">
            <div>
              <p className="eyebrow-label">Recent Activity</p>
              <h3 className="mt-2 text-xl font-bold text-zinc-950">Latest completed sales</h3>
            </div>
          </div>
          <div className="panel-body space-y-4 sm:space-y-6">
            {stats.recentActivity.map((activity: any) => (
              <div key={activity.id} className="flex items-start space-x-3 sm:space-x-4">
                <div className="mt-1 h-2 w-2 rounded-full bg-orange-500 ring-4 ring-orange-50"></div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">Sale completed #{activity.invoiceNumber}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(activity.createdAt).toLocaleString()} • Cashier: {activity.cashierName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && notificationData && (
        <div className="panel-section">
          <div className="panel-body sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                  <BellRing size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Inventory Email Notifications</h3>
                  <p className="text-sm text-zinc-500">
                    Choose who gets emailed when billing reduces inventory stock.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">SMTP Status</p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  {notificationData.mail.enabled ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
                  {notificationData.mail.enabled ? "Ready to send" : "SMTP not configured"}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Sender</p>
                <p className="mt-2 text-sm font-semibold text-zinc-900 break-all">
                  {notificationData.mail.from || "Not set"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr,1.4fr]">
            <form onSubmit={handleAddRecipient} className="rounded-3xl border border-zinc-200 bg-zinc-50/90 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                <UserPlus size={18} />
                Add Recipient
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Add one or more admin or staff emails to receive stock reduction alerts.
              </p>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Recipient Name</label>
                  <input
                    required
                    type="text"
                    value={recipientForm.name}
                    onChange={(event) => setRecipientForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    placeholder="Store Owner"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      required
                      type="email"
                      value={recipientForm.email}
                      onChange={(event) => setRecipientForm((current) => ({ ...current, email: event.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                      placeholder="manager@example.com"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSavingRecipient}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={16} />
                  {isSavingRecipient ? "Saving..." : "Add Notification Recipient"}
                </button>
              </div>
            </form>

            <div className="grid gap-4 sm:grid-cols-2">
              {notificationData.recipients.map((recipient) => (
                <div key={recipient.id} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-zinc-900">{recipient.name}</p>
                      <p className="mt-1 break-all text-sm text-zinc-500">{recipient.email}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        recipient.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                      )}
                    >
                      {recipient.isEnabled ? "Enabled" : "Paused"}
                    </span>
                  </div>

                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Added {new Date(recipient.createdAt).toLocaleDateString()}
                  </p>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => handleToggleRecipient(recipient)}
                      className={cn(
                        "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                        recipient.isEnabled
                          ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                      )}
                    >
                      {recipient.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecipient(recipient)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition-all hover:bg-red-100"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {!notificationData.recipients.length && (
                <div className="sm:col-span-2 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
                  <p className="text-base font-semibold text-zinc-900">No recipients added yet</p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Add at least one email above so inventory reduction alerts can be delivered.
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
