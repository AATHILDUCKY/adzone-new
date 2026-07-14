import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Search, ShieldCheck } from "lucide-react";
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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Audit Trail</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            Review who changed what in the system, with searchable activity across users, sales, inventory, and settings.
          </p>
        </div>

        <div className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
          {user.role === "AUDITOR" ? "Auditor read-only access" : "Admin oversight"}
        </div>
      </div>

      <div className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search action, details, user, or email..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(event) => {
              setModuleFilter(event.target.value as (typeof moduleOptions)[number]);
              setPage(1);
            }}
            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
          >
            {moduleOptions.map((module) => (
              <option key={module} value={module}>
                {module === "ALL" ? "All Modules" : toTitleCase(module)}
              </option>
            ))}
          </select>

          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </label>

          <label className="relative">
            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          <span>{pageLabel}</span>
          <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
        </div>

        <div className="mt-5 space-y-4">
          {data.items.map((entry) => (
            <div key={entry.id} className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
                    <Activity size={20} />
                  </div>
                  <div>
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

                <div className="min-w-[220px] rounded-2xl bg-zinc-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
                    <ShieldCheck size={14} />
                    Actor
                  </div>
                  <p className="mt-2 text-sm font-semibold text-zinc-900">{entry.user?.name || "System"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{entry.user?.email || "No user linked"}</p>
                  {entry.user?.role ? (
                    <span
                      className={cn(
                        "mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                        entry.user.role === "ADMIN"
                          ? "bg-purple-50 text-purple-700"
                          : entry.user.role === "AUDITOR"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700",
                      )}
                    >
                      {entry.user.role}
                    </span>
                  ) : null}
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

        <div className="mt-6 flex justify-end gap-3 border-t border-zinc-100 pt-5">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={data.pagination.page <= 1}
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((current) => Math.min(data.pagination.totalPages, current + 1))}
            disabled={data.pagination.page >= data.pagination.totalPages}
            className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
