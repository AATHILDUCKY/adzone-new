import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, ReceiptText, Search, User } from "lucide-react";
import { toast } from "sonner";
import InvoiceModal from "../components/InvoiceModal";
import { useShopProfile } from "../components/ShopProfileProvider";
import { apiFetch, cn } from "../lib/utils";
import { formatCurrency, printOrderInvoice, type OrderInvoice, type OrderListEntry } from "../lib/orders";

type CustomerDetails = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type HistoryPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type CustomerHistoryResponse = {
  customer: CustomerDetails;
  items: OrderListEntry[];
  pagination: HistoryPagination;
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
  };
};

const HISTORY_PAGE_SIZE = 20;

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

export default function CustomerHistory() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { shopProfile } = useShopProfile();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CustomerHistoryResponse | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderInvoice | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    const params = new URLSearchParams({
      page: String(page),
      limit: String(HISTORY_PAGE_SIZE),
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    setLoading(true);

    apiFetch(`/customers/${id}/history?${params.toString()}`)
      .then((response: CustomerHistoryResponse) => {
        setHistory(response);
      })
      .catch((error: Error) => {
        toast.error(error.message || "Failed to load customer history");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, page, search]);

  const pagination = history?.pagination;
  const summary = history?.summary;
  const pageStart = pagination?.totalItems ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const pageEnd = pagination?.totalItems ? Math.min(pagination.page * pagination.limit, pagination.totalItems) : 0;
  const hasItems = Boolean(history?.items.length);
  const pageTitle = useMemo(() => history?.customer?.name || "Customer History", [history?.customer?.name]);

  const openInvoice = async (orderId: string) => {
    setLoadingInvoiceId(orderId);
    try {
      const order = await apiFetch(`/orders/${orderId}`);
      setSelectedOrder(order);
    } catch (error: any) {
      toast.error(error.message || "Failed to load invoice");
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handlePrint = () => {
    if (!selectedOrder) {
      return;
    }

    try {
      printOrderInvoice(selectedOrder, shopProfile);
    } catch (error: any) {
      toast.error(error.message || "Failed to open print window");
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-blue-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.2),_transparent_34%),linear-gradient(135deg,#eff6ff_0%,#ffffff_60%,#f8fafc_100%)] shadow-[0_18px_50px_rgba(59,130,246,0.12)]">
        <div className="space-y-5 px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/customers")}
              className="inline-flex items-center rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </button>
          </div>

          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{pageTitle}</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Full order history for this customer with efficient paging and quick lookup.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Orders</p>
              <p className="mt-2 text-2xl font-bold text-zinc-950">{summary?.totalOrders ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Revenue</p>
              <p className="mt-2 text-2xl font-bold text-zinc-950">{formatCurrency(summary?.totalRevenue ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">Avg Order</p>
              <p className="mt-2 text-2xl font-bold text-zinc-950">{formatCurrency(summary?.averageOrderValue ?? 0)}</p>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 sm:grid-cols-2">
            <p className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <User size={14} className="text-zinc-400" />
              {history?.customer?.name || "-"}
            </p>
            <p className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <Phone size={14} className="text-zinc-400" />
              {history?.customer?.phone || "No phone"}
            </p>
            <p className="inline-flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
              <Mail size={14} className="text-zinc-400" />
              {history?.customer?.email || "No email"}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 sm:px-6">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search invoice, cashier, payment method..."
              className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <p className="text-xs font-medium text-zinc-500">
            Showing {pageStart}-{pageEnd} of {pagination?.totalItems ?? 0}
          </p>
        </div>

        <div className="divide-y divide-zinc-100">
          {hasItems ? (
            history?.items.map((order) => (
              <div key={order.id} className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                <div>
                  <button
                    type="button"
                    onClick={() => openInvoice(order.id)}
                    disabled={loadingInvoiceId === order.id}
                    className={cn(
                      "text-left text-sm font-bold underline-offset-2",
                      loadingInvoiceId === order.id
                        ? "cursor-wait text-zinc-400"
                        : "text-zinc-900 hover:text-blue-700 hover:underline",
                    )}
                  >
                    {loadingInvoiceId === order.id ? "Loading invoice..." : order.invoiceNumber}
                  </button>
                  <p className="mt-1 text-xs text-zinc-500">{formatOrderDate(order.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Cashier</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-700">{order.cashier.name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Payment</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-700">{order.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Items</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-700">{order.itemsCount}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm font-bold text-zinc-900">{formatCurrency(order.total)}</p>
                  <p className={cn("mt-1 text-xs font-semibold", order.balance >= 0 ? "text-emerald-600" : "text-amber-600")}>
                    {order.balance >= 0 ? "Paid" : `Due ${formatCurrency(Math.abs(order.balance))}`}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-5 py-16 text-center sm:px-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-100 text-zinc-400">
                <ReceiptText size={26} />
              </div>
              <p className="mt-5 text-lg font-semibold text-zinc-900">{loading ? "Loading history..." : "No history found"}</p>
              <p className="mt-2 text-sm text-zinc-500">
                {loading ? "Please wait while we load this customer timeline." : "Try changing your search term."}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={!pagination?.hasPreviousPage || loading}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm font-semibold transition",
              pagination?.hasPreviousPage && !loading
                ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                : "cursor-not-allowed border-zinc-100 bg-zinc-100 text-zinc-400",
            )}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={!pagination?.hasNextPage || loading}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm font-semibold transition",
              pagination?.hasNextPage && !loading
                ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                : "cursor-not-allowed border-zinc-100 bg-zinc-100 text-zinc-400",
            )}
          >
            Next
          </button>
        </div>
      </section>

      {selectedOrder ? (
        <InvoiceModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onPrint={handlePrint}
        />
      ) : null}
    </div>
  );
}
