import { useEffect, useMemo, useState } from "react";
import { Activity, Boxes, CalendarDays, History, PackageSearch, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, cn } from "../lib/utils";
import { useOutletContext } from "../components/OutletContext";

type AuditLogEntry = {
  id: string;
  action: string;
  module: string;
  details: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
};

type AuditLogResponse = {
  items: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

type OutletContext = {
  user: {
    role: string;
  };
};

type InventoryReport = {
  summary: {
    totalMaterials: number;
    activeMaterials: number;
    lowStockCount: number;
    outOfStockCount: number;
    inventoryValue: number;
  };
  lowStockItems: Array<{
    id: string;
    name: string;
    sku: string;
    unitType: string;
    currentStock: number;
    minimumStockThreshold: number;
  }>;
  recentTransactions: Array<{
    id: string;
    transactionType: string;
    quantity: number;
    reason: string | null;
    performedBy: string | null;
    createdAt: string;
    product: { id: string; name: string; sku: string; unitType: string };
  }>;
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatInventoryValue(value: number) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatStock(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function roleBadgeClass(role: string) {
  return cn(
    "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
    role === "ADMIN"
      ? "bg-purple-50 text-purple-700"
      : role === "AUDITOR"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700",
  );
}

const moduleOptions = ["ALL", "users", "sales", "inventory", "notifications", "settings"] as const;

export default function AuditLogs() {
  const { user } = useOutletContext<OutletContext>();
  const [data, setData] = useState<AuditLogResponse>({
    items: [],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 0,
      totalPages: 1,
    },
  });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<(typeof moduleOptions)[number]>("ALL");
  const [startDate, setStartDate] = useState(() => formatDateInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [activeView, setActiveView] = useState<"activity" | "inventory">("activity");
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  useEffect(() => {
    apiFetch("/audit-logs/inventory-report")
      .then((response) => setInventoryReport(response))
      .catch((error: any) => toast.error(error.message || "Failed to load inventory report"))
      .finally(() => setInventoryLoading(false));
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");

    if (search) {
      params.set("search", search);
    }

    if (moduleFilter !== "ALL") {
      params.set("module", moduleFilter);
    }

    if (startDate) {
      params.set("start", startDate);
    }

    if (endDate) {
      params.set("end", endDate);
    }

    setLoading(true);
    apiFetch(`/audit-logs?${params.toString()}`)
      .then((response) => setData(response))
      .catch((error: any) => {
        toast.error(error.message || "Failed to load audit logs");
      })
      .finally(() => setLoading(false));
  }, [endDate, moduleFilter, page, search, startDate]);

  const pageLabel = useMemo(() => {
    if (!data.pagination.totalItems) {
      return "No audit entries";
    }

    const start = (data.pagination.page - 1) * data.pagination.limit + 1;
    const end = Math.min(start + data.items.length - 1, data.pagination.totalItems);
    return `Showing ${start}-${end} of ${data.pagination.totalItems}`;
  }, [data]);

  if (loading) {
    return <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Loading audit trail...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">Audit Trail</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-zinc-500 sm:mt-2">
            Review who changed what in the system, with searchable activity across users, sales, inventory, and settings.
          </p>
        </div>

        <div className="self-start rounded-full bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
          {user.role === "AUDITOR" ? "Auditor read-only access" : "Admin oversight"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1.5 sm:inline-grid sm:min-w-[360px]">
        <button
          type="button"
          onClick={() => setActiveView("activity")}
          className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold", activeView === "activity" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
        >
          <History size={17} /> Activity
        </button>
        <button
          type="button"
          onClick={() => setActiveView("inventory")}
          className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold", activeView === "inventory" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
        >
          <Boxes size={17} /> Inventory
        </button>
      </div>

      <div className={cn("rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm sm:rounded-[30px] sm:p-6", activeView !== "activity" && "hidden")}>
        <div className="grid grid-cols-[minmax(0,1fr)_48px] gap-2.5 sm:gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search action, details, user, or email..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-base text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none sm:text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen((current) => !current)}
            aria-label={mobileFiltersOpen ? "Hide audit filters" : "Show audit filters"}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-semibold lg:hidden",
              mobileFiltersOpen ? "border-orange-200 bg-orange-50 text-orange-700" : "border-zinc-200 bg-white text-zinc-700",
            )}
          >
            {mobileFiltersOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
            <span className="sr-only">{mobileFiltersOpen ? "Hide filters" : "Filter activity"}</span>
          </button>

          <select
            value={moduleFilter}
            onChange={(event) => {
              setModuleFilter(event.target.value as (typeof moduleOptions)[number]);
              setPage(1);
            }}
            className={cn("col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-base text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none sm:text-sm lg:col-span-1 lg:rounded-2xl lg:px-4 lg:py-3", mobileFiltersOpen ? "block" : "hidden", "lg:block")}
          >
            {moduleOptions.map((module) => (
              <option key={module} value={module}>
                {module === "ALL" ? "All Modules" : toTitleCase(module)}
              </option>
            ))}
          </select>

          <label className={cn("min-w-0", mobileFiltersOpen ? "block" : "hidden", "lg:block")}>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 lg:hidden">From</span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 lg:left-4" size={17} />
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setPage(1);
                }}
                aria-label="Audit start date"
                className="w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-2 text-base text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none sm:text-sm lg:rounded-2xl lg:py-3 lg:pl-11 lg:pr-4"
              />
            </span>
          </label>

          <label className={cn("min-w-0", mobileFiltersOpen ? "block" : "hidden", "lg:block")}>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 lg:hidden">To</span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 lg:left-4" size={17} />
              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setPage(1);
                }}
                aria-label="Audit end date"
                className="w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-2 text-base text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none sm:text-sm lg:rounded-2xl lg:py-3 lg:pl-11 lg:pr-4"
              />
            </span>
          </label>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 sm:mt-5 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
          <span>{pageLabel}</span>
          <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
        </div>

        <div className="mt-3 space-y-3 sm:mt-5 sm:space-y-4">
          {data.items.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm sm:rounded-[28px] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="shrink-0 rounded-xl bg-orange-50 p-2.5 text-orange-600 sm:rounded-2xl sm:p-3">
                    <Activity size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-zinc-900">{toTitleCase(entry.action)}</p>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        {entry.module}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-600">{entry.details || "No extra details were recorded."}</p>
                    <p className="mt-2 text-xs text-zinc-400">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                </div>

                {/* Compact identity footer for mobile / tablet */}
                <div className="flex items-center gap-3 border-t border-zinc-100 pt-3 lg:hidden">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                    {(entry.user?.name || "System").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">{entry.user?.name || "System"}</p>
                    <p className="truncate text-xs text-zinc-500">{entry.user?.email || "No user linked"}</p>
                  </div>
                  {entry.user?.role ? <span className={roleBadgeClass(entry.user.role)}>{entry.user.role}</span> : null}
                </div>

                {/* Rich actor panel for desktop */}
                <div className="hidden rounded-2xl bg-zinc-50 px-4 py-3 lg:block lg:min-w-[220px]">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
                    <ShieldCheck size={14} />
                    Actor
                  </div>
                  <p className="mt-2 text-sm font-semibold text-zinc-900">{entry.user?.name || "System"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{entry.user?.email || "No user linked"}</p>
                  {entry.user?.role ? <span className={cn(roleBadgeClass(entry.user.role), "mt-3")}>{entry.user.role}</span> : null}
                </div>
              </div>
            </div>
          ))}

          {!data.items.length ? (
            <div className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center text-sm text-zinc-500">
              No audit entries matched these filters.
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 sm:mt-6 sm:flex sm:justify-end sm:pt-5">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={data.pagination.page <= 1}
            className="min-h-12 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((current) => Math.min(data.pagination.totalPages, current + 1))}
            disabled={data.pagination.page >= data.pagination.totalPages}
            className="min-h-12 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {activeView === "inventory" ? (
        inventoryLoading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">Loading inventory report...</div>
        ) : inventoryReport ? (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
              {[
                { label: "Inventory Value", value: formatInventoryValue(inventoryReport.summary.inventoryValue), tone: "text-orange-700", wide: true },
                { label: "Active Materials", value: inventoryReport.summary.activeMaterials, tone: "text-zinc-900" },
                { label: "Total Materials", value: inventoryReport.summary.totalMaterials, tone: "text-zinc-900" },
                { label: "Low Stock", value: inventoryReport.summary.lowStockCount, tone: "text-amber-700" },
                { label: "Out of Stock", value: inventoryReport.summary.outOfStockCount, tone: "text-red-600" },
              ].map((metric) => (
                <div key={metric.label} className={cn("rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm sm:p-5", metric.wide && "col-span-2 sm:col-span-1")}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 sm:text-xs">{metric.label}</p>
                  <p className={cn("mt-2 break-words text-xl font-bold sm:text-2xl", metric.tone)}>{metric.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2 sm:gap-6">
              <section className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm sm:rounded-[28px] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><PackageSearch size={19} /></div>
                  <div>
                    <h2 className="font-bold text-zinc-900">Low-stock materials</h2>
                    <p className="text-xs text-zinc-500">Current stock at or below its threshold</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2.5">
                  {inventoryReport.lowStockItems.length ? inventoryReport.lowStockItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-zinc-900">{item.name}</p>
                        <p className="truncate text-[11px] text-zinc-500">{item.sku} · threshold {formatStock(item.minimumStockThreshold)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-red-600">{formatStock(item.currentStock)} {item.unitType}</p>
                        <p className="text-[10px] font-semibold uppercase text-red-500">Low</p>
                      </div>
                    </div>
                  )) : <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">All active materials are above their thresholds.</p>}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm sm:rounded-[28px] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-orange-50 p-2.5 text-orange-600"><Activity size={19} /></div>
                  <div>
                    <h2 className="font-bold text-zinc-900">Recent inventory movements</h2>
                    <p className="text-xs text-zinc-500">Latest sales, restocks, wastage, and adjustments</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2.5">
                  {inventoryReport.recentTransactions.length ? inventoryReport.recentTransactions.map((transaction) => (
                    <div key={transaction.id} className="rounded-xl border border-zinc-100 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-zinc-900">{transaction.product.name}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">{toTitleCase(transaction.transactionType)} · {transaction.performedBy || "System"}</p>
                        </div>
                        <p className={cn("shrink-0 text-sm font-bold", transaction.transactionType.includes("OUT") || transaction.transactionType === "WASTAGE" ? "text-red-600" : "text-emerald-600")}>
                          {transaction.transactionType.includes("OUT") || transaction.transactionType === "WASTAGE" ? "−" : "+"}{formatStock(transaction.quantity)} {transaction.product.unitType}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-[10px] text-zinc-400 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                        <span className="line-clamp-2">{transaction.reason || "No reason recorded"}</span>
                        <span className="shrink-0">{new Date(transaction.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  )) : <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">No inventory movements recorded.</p>}
                </div>
              </section>
            </div>
          </div>
        ) : null
      ) : null}
    </div>
  );
}
