import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "../components/OutletContext";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import InvoiceModal from "../components/InvoiceModal";
import { useShopProfile } from "../components/ShopProfileProvider";
import { apiFetch, cn } from "../lib/utils";
import {
  formatCurrency,
  printOrderInvoice,
  type OrderInvoice,
  type OrderListEntry,
  type OrderListResponse,
} from "../lib/orders";

type DateFilterMode = "ALL" | "TODAY" | "LAST_7_DAYS" | "THIS_MONTH" | "PARTICULAR_DATE" | "CUSTOM_RANGE";
type PaymentStatusFilter = "ALL" | "PAID" | "UNPAID";

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseLocalDateStart(value: string) {
  const [year, month, day] = value.split("-").map((segment) => Number.parseInt(segment, 10));
  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseLocalDateEnd(value: string) {
  const [year, month, day] = value.split("-").map((segment) => Number.parseInt(segment, 10));
  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function resolveDateRange(mode: DateFilterMode, selectedDate: string, rangeStart: string, rangeEnd: string) {
  const today = new Date();

  if (mode === "TODAY") {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (mode === "LAST_7_DAYS") {
    const start = shiftDays(today, -6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
    };
  }

  if (mode === "THIS_MONTH") {
    const start = startOfMonth(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
    };
  }

  if (mode === "PARTICULAR_DATE" && selectedDate) {
    return {
      start: parseLocalDateStart(selectedDate),
      end: parseLocalDateEnd(selectedDate),
    };
  }

  if (mode === "CUSTOM_RANGE") {
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      return {
        start: parseLocalDateStart(rangeEnd),
        end: parseLocalDateEnd(rangeStart),
      };
    }

    return {
      start: rangeStart ? parseLocalDateStart(rangeStart) : undefined,
      end: rangeEnd ? parseLocalDateEnd(rangeEnd) : undefined,
    };
  }

  return { start: undefined, end: undefined };
}

function getDateFilterLabel(mode: DateFilterMode, start?: Date, end?: Date) {
  if (mode === "ALL" || (!start && !end)) {
    return "All dates";
  }

  if (start && end && start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString();
  }

  if (start && end) {
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  return start?.toLocaleDateString() || end?.toLocaleDateString() || "Custom date";
}

const emptyOrdersResponse: OrderListResponse = {
  items: [],
  pagination: {
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
  summary: {
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
  },
};

function normalizeOrdersResponse(value: unknown): OrderListResponse {
  if (Array.isArray(value)) {
    const items = value as OrderListEntry[];
    const totalRevenue = items.reduce((sum, order) => sum + Number(order.total || 0), 0);

    return {
      items,
      pagination: {
        page: 1,
        limit: items.length || 20,
        totalItems: items.length,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
      summary: {
        totalOrders: items.length,
        totalRevenue,
        averageOrderValue: items.length ? totalRevenue / items.length : 0,
      },
    };
  }

  if (!value || typeof value !== "object") {
    return emptyOrdersResponse;
  }

  const candidate = value as Partial<OrderListResponse>;
  const items = Array.isArray(candidate.items) ? candidate.items : [];
  const totalRevenue = items.reduce((sum, order) => sum + Number(order.total || 0), 0);

  return {
    items,
    pagination: {
      page: candidate.pagination?.page ?? 1,
      limit: candidate.pagination?.limit ?? 20,
      totalItems: candidate.pagination?.totalItems ?? items.length,
      totalPages: candidate.pagination?.totalPages ?? Math.max(1, Math.ceil((candidate.pagination?.totalItems ?? items.length) / (candidate.pagination?.limit ?? 20))),
      hasPreviousPage: candidate.pagination?.hasPreviousPage ?? false,
      hasNextPage: candidate.pagination?.hasNextPage ?? false,
    },
    summary: {
      totalOrders: candidate.summary?.totalOrders ?? items.length,
      totalRevenue: candidate.summary?.totalRevenue ?? totalRevenue,
      averageOrderValue: candidate.summary?.averageOrderValue ?? (items.length ? totalRevenue / items.length : 0),
    },
  };
}

export default function Orders() {
  const { user } = useOutletContext<{ user: { role: string } }>();
  const { shopProfile } = useShopProfile();
  const canManagePayments = user.role === "ADMIN" || user.role === "CASHIER";
  const [ordersResponse, setOrdersResponse] = useState<OrderListResponse>(emptyOrdersResponse);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("TODAY");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>("ALL");
  const [selectedDate, setSelectedDate] = useState(() => formatInputDate(new Date()));
  const [rangeStart, setRangeStart] = useState(() => formatInputDate(shiftDays(new Date(), -6)));
  const [rangeEnd, setRangeEnd] = useState(() => formatInputDate(new Date()));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderInvoice | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);
  const [paymentUpdateOrder, setPaymentUpdateOrder] = useState<OrderListEntry | null>(null);
  const [paymentUpdateAmount, setPaymentUpdateAmount] = useState("");
  const [paymentUpdateMethod, setPaymentUpdateMethod] = useState("CASH");
  const [updatingPayment, setUpdatingPayment] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const activeDateRange = useMemo(
    () => resolveDateRange(dateFilterMode, selectedDate, rangeStart, rangeEnd),
    [dateFilterMode, selectedDate, rangeStart, rangeEnd],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "20");

    if (search) {
      params.set("search", search);
    }

    if (activeDateRange.start) {
      params.set("start", activeDateRange.start.toISOString());
    }

    if (activeDateRange.end) {
      params.set("end", activeDateRange.end.toISOString());
    }

    if (paymentStatusFilter !== "ALL") {
      params.set("paymentStatus", paymentStatusFilter);
    }

    const isFirstLoad = loading;
    if (!isFirstLoad) {
      setRefreshing(true);
    }

    apiFetch(`/orders?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        setOrdersResponse(normalizeOrdersResponse(response));
      })
      .catch((error: any) => {
        if (error?.name === "AbortError") {
          return;
        }

        toast.error(error.message || "Failed to load order history");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      controller.abort();
    };
  }, [activeDateRange.end, activeDateRange.start, page, paymentStatusFilter, search]);

  const orders = ordersResponse.items;
  const summary = ordersResponse.summary;
  const pagination = ordersResponse.pagination;
  const pageStart = pagination.totalItems ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const pageEnd = pagination.totalItems ? pageStart + orders.length - 1 : 0;

  const openInvoice = async (orderId: string, autoPrint = false) => {
    setLoadingInvoiceId(orderId);
    try {
      const order = await apiFetch(`/orders/${orderId}`);
      setSelectedOrder(order);
      if (autoPrint) {
        await printOrderInvoice(order, shopProfile);
        if (shopProfile.printerName) toast.success(`Invoice sent to ${shopProfile.printerName}`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load invoice");
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handlePrint = async () => {
    if (!selectedOrder) {
      return;
    }

    try {
      await printOrderInvoice(selectedOrder, shopProfile);
      if (shopProfile.printerName) toast.success(`Invoice sent to ${shopProfile.printerName}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to print invoice");
    }
  };

  const resetFilters = () => {
    const today = new Date();
    setSearchInput("");
    setSearch("");
    setDateFilterMode("TODAY");
    setPaymentStatusFilter("ALL");
    setSelectedDate(formatInputDate(today));
    setRangeStart(formatInputDate(shiftDays(today, -6)));
    setRangeEnd(formatInputDate(today));
    setPage(1);
  };

  const submitPaymentUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentUpdateOrder) {
      return;
    }

    const amount = Number(paymentUpdateAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }

    setUpdatingPayment(true);
    try {
      const updatedOrder = await apiFetch(`/orders/${paymentUpdateOrder.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentMethod: paymentUpdateMethod,
        }),
      });
      toast.success("Payment updated");
      setPaymentUpdateOrder(null);
      setPaymentUpdateAmount("");
      if (selectedOrder?.id === updatedOrder.id) {
        setSelectedOrder(updatedOrder);
      }
      setRefreshing(true);
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "20");
      if (search) {
        params.set("search", search);
      }
      if (activeDateRange.start) {
        params.set("start", activeDateRange.start.toISOString());
      }
      if (activeDateRange.end) {
        params.set("end", activeDateRange.end.toISOString());
      }
      if (paymentStatusFilter !== "ALL") {
        params.set("paymentStatus", paymentStatusFilter);
      }
      const response = await apiFetch(`/orders?${params.toString()}`);
      setOrdersResponse(normalizeOrdersResponse(response));
    } catch (error: any) {
      toast.error(error.message || "Failed to update payment");
    } finally {
      setUpdatingPayment(false);
      setRefreshing(false);
    }
  };

  const quickFilters: Array<{ id: DateFilterMode; label: string }> = [
    { id: "TODAY", label: "Today" },
    { id: "LAST_7_DAYS", label: "Last 7 Days" },
    { id: "THIS_MONTH", label: "This Month" },
    { id: "PARTICULAR_DATE", label: "Particular Date" },
    { id: "CUSTOM_RANGE", label: "Custom Range" },
    { id: "ALL", label: "All Time" },
  ];

  if (loading) {
    return <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Loading orders...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Order History</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            Fast, filterable invoice history with lighter loading and a cleaner day-by-day workflow.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">
            {pageStart && pageEnd ? `Showing ${pageStart}-${pageEnd} of ${pagination.totalItems}` : "No orders yet"}
          </div>
          <div className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700">
            {getDateFilterLabel(dateFilterMode, activeDateRange.start, activeDateRange.end)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                <Filter size={18} className="text-orange-600" />
                Smart Filters
              </div>
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                <RotateCcw size={15} />
                Reset
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search invoice, customer, or cashier..."
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-4 pl-12 pr-4 text-zinc-900 shadow-sm focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {quickFilters.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setDateFilterMode(preset.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-all",
                    dateFilterMode === preset.id
                      ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200"
                      : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Payment</p>
              {[
                { id: "ALL" as const, label: "All" },
                { id: "PAID" as const, label: "Paid" },
                { id: "UNPAID" as const, label: "Unpaid" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => {
                    setPaymentStatusFilter(filter.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-all",
                    paymentStatusFilter === filter.id
                      ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200"
                      : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {(dateFilterMode === "PARTICULAR_DATE" || dateFilterMode === "CUSTOM_RANGE") && (
              <div className={cn("grid gap-4", dateFilterMode === "CUSTOM_RANGE" ? "lg:grid-cols-2" : "lg:grid-cols-1")}>
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
                    {dateFilterMode === "PARTICULAR_DATE" ? "Date" : "Start Date"}
                  </span>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input
                      type="date"
                      value={dateFilterMode === "PARTICULAR_DATE" ? selectedDate : rangeStart}
                      onChange={(event) => {
                        if (dateFilterMode === "PARTICULAR_DATE") {
                          setSelectedDate(event.target.value);
                        } else {
                          setRangeStart(event.target.value);
                        }
                        setPage(1);
                      }}
                      className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-12 pr-4 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                    />
                  </div>
                </label>

                {dateFilterMode === "CUSTOM_RANGE" && (
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">End Date</span>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                      <input
                        type="date"
                        value={rangeEnd}
                        onChange={(event) => {
                          setRangeEnd(event.target.value);
                          setPage(1);
                        }}
                        className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-12 pr-4 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
                      />
                    </div>
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="relative mt-5 grid gap-4">
            {refreshing && (
              <div className="absolute inset-x-0 top-0 z-10 rounded-2xl bg-white/90 px-4 py-3 text-sm text-zinc-500 shadow-sm backdrop-blur-sm">
                Refreshing orders...
              </div>
            )}

            {orders.map((order: OrderListEntry) => (
              <div key={order.id} className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
                      <ReceiptText size={22} />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-bold text-zinc-900">{order.invoiceNumber}</p>
                        {order.balance < 0 ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-600">
                            Unpaid
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                            Paid
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">
                        {order.customer?.name || "Walk-in Customer"} • {order.cashier.name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{new Date(order.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[470px]">
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Items</p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">{order.itemsCount}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Total</p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">{formatCurrency(order.total)}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Paid</p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">{formatCurrency(order.paidAmount)}</p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Pending</p>
                      <p className={cn("mt-2 text-lg font-bold", order.balance < 0 ? "text-red-600" : "text-emerald-600")}>
                        {formatCurrency(Math.max(0, Number((order.total - order.paidAmount).toFixed(2))))}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => openInvoice(order.id)}
                    disabled={loadingInvoiceId === order.id}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                      loadingInvoiceId === order.id
                        ? "cursor-wait bg-zinc-100 text-zinc-400"
                        : "bg-zinc-900 text-white hover:bg-zinc-800",
                    )}
                  >
                    <Eye size={16} />
                    {loadingInvoiceId === order.id ? "Loading..." : "View Invoice"}
                  </button>
                  <button
                    onClick={() => openInvoice(order.id, true)}
                    disabled={loadingInvoiceId === order.id}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition-all hover:bg-orange-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Printer size={16} />
                    Print / Save PDF
                  </button>
                  {order.balance < 0 && canManagePayments ? (
                    <button
                      onClick={() => {
                        setPaymentUpdateOrder(order);
                        setPaymentUpdateAmount(Math.abs(order.balance).toFixed(2));
                        setPaymentUpdateMethod(order.paymentMethod || "CASH");
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100"
                    >
                      Add Payment
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {!orders.length && (
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center">
                <ShoppingBag size={36} className="mx-auto text-zinc-300" />
                <p className="mt-4 text-lg font-semibold text-zinc-900">No orders found</p>
                <p className="mt-2 text-sm text-zinc-500">Try a different date, payment status, or customer filter.</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-zinc-500">
              Page <span className="font-semibold text-zinc-900">{pagination.page}</span> of{" "}
              <span className="font-semibold text-zinc-900">{pagination.totalPages}</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!pagination.hasPreviousPage}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                onClick={() => setPage((current) => current + 1)}
                disabled={!pagination.hasNextPage}
                className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="flex min-h-[138px] flex-col justify-between rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Filtered Orders</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{summary.totalOrders}</p>
            <p className="mt-1 text-sm text-zinc-500">Server-side result count for the current view.</p>
          </div>

          <div className="flex min-h-[138px] flex-col justify-between rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Filtered Revenue</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{formatCurrency(summary.totalRevenue)}</p>
            <p className="mt-1 text-sm text-zinc-500">Revenue across all matching orders.</p>
          </div>

          <div className="flex min-h-[138px] flex-col justify-between rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Average Order</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{formatCurrency(summary.averageOrderValue)}</p>
            <p className="mt-1 text-sm text-zinc-500">Average invoice value for active filters.</p>
          </div>

          <div className="rounded-[30px] border border-zinc-200 bg-gradient-to-br from-orange-50 via-white to-zinc-50 p-5 shadow-sm sm:min-h-[190px] sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white p-3 text-orange-700 shadow-sm">
                <CalendarDays size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900">Date Focus</p>
                <p className="text-sm text-zinc-500">{getDateFilterLabel(dateFilterMode, activeDateRange.start, activeDateRange.end)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-600">
              Use the calendar filters to jump to a particular day, compare a custom range, or keep the default last 7 days view for faster loading.
            </p>
          </div>
        </div>
      </div>

      {paymentUpdateOrder && canManagePayments ? (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-7">
            <h3 className="text-lg font-bold text-zinc-900">Add Customer Payment</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {paymentUpdateOrder.invoiceNumber} • pending{" "}
              {formatCurrency(Math.max(0, Number((paymentUpdateOrder.total - paymentUpdateOrder.paidAmount).toFixed(2))))}
            </p>

            <form onSubmit={submitPaymentUpdate} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Amount</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={paymentUpdateAmount}
                  onChange={(event) => setPaymentUpdateAmount(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Payment Method</label>
                <select
                  value={paymentUpdateMethod}
                  onChange={(event) => setPaymentUpdateMethod(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                >
                  <option value="CASH">CASH</option>
                  <option value="CARD">CARD</option>
                  <option value="BANK">BANK</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (updatingPayment) {
                      return;
                    }
                    setPaymentUpdateOrder(null);
                    setPaymentUpdateAmount("");
                  }}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingPayment}
                  className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {updatingPayment ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedOrder && (
        <InvoiceModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onPrint={handlePrint}
        />
      )}
    </div>
  );
}
