import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, cn } from "../lib/utils";
import { Plus, Search, User, Phone, Mail, MapPin, History, PencilLine, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useOutletContext } from "../components/OutletContext";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type CustomerFormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

type CustomerPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type CustomerListResponse = {
  items: Customer[];
  pagination: CustomerPagination;
};

const emptyCustomerForm: CustomerFormState = { name: "", phone: "", email: "", address: "" };
const CUSTOMER_PAGE_SIZE = 20;

function normalizeCustomerForm(customer?: Customer | null): CustomerFormState {
  if (!customer) {
    return emptyCustomerForm;
  }

  return {
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    address: customer.address || "",
  };
}

export default function Customers() {
  const { user } = useOutletContext<{ user: any }>();
  const router = useRouter();
  const canManageCustomers = user.role === "ADMIN" || user.role === "CASHIER" || user.role === "INVENTORY_MANAGER";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [pagination, setPagination] = useState<CustomerPagination>({
    page: 1,
    limit: CUSTOMER_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(CUSTOMER_PAGE_SIZE),
    });

    if (search) {
      params.set("search", search);
    }

    setIsLoading(true);

    apiFetch(`/customers?${params.toString()}`)
      .then((response: Customer[] | CustomerListResponse) => {
        if (Array.isArray(response)) {
          setCustomers(response);
          setPagination({
            page: 1,
            limit: response.length || CUSTOMER_PAGE_SIZE,
            totalItems: response.length,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          });
          return;
        }

        setCustomers(response.items);
        setPagination(response.pagination);
      })
      .catch((err: Error) => {
        toast.error(err.message || "Failed to load customers");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [page, search, reloadKey]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm);
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm(normalizeCustomerForm(customer));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setEditingCustomer(null);
    setCustomerForm(emptyCustomerForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        name: customerForm.name,
        phone: customerForm.phone,
        email: customerForm.email,
        address: customerForm.address,
      };

      const customer = await apiFetch(editingCustomer ? `/customers/${editingCustomer.id}` : "/customers", {
        method: editingCustomer ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setCustomers((current) => (editingCustomer
        ? current.map((item) => (item.id === editingCustomer.id ? customer : item))
        : current));

      closeModal();
      toast.success(editingCustomer ? "Customer updated successfully" : "Customer added successfully");
      if (!editingCustomer) {
        setPage(1);
      }
      setReloadKey((current) => current + 1);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const customersWithPhone = useMemo(() => customers.filter((customer) => customer.phone).length, [customers]);
  const customersWithEmail = useMemo(() => customers.filter((customer) => customer.email).length, [customers]);
  const pageStart = pagination.totalItems ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const pageEnd = pagination.totalItems ? Math.min(pagination.page * pagination.limit, pagination.totalItems) : 0;

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:px-8">
          <div className="space-y-5">
            <div className="hero-badge">
              <Sparkles size={14} />
              Customer Directory
            </div>

            <div>
              <h1 className="page-title sm:text-4xl">Customers</h1>
              <p className="page-copy mt-2 sm:text-base">
                A modern one-line directory built for fast lookups, quick edits, and smooth growth as your customer base gets bigger.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="hero-stat">
                <p className="metric-label">Visible</p>
                <p className="hero-stat-value">{customers.length}</p>
              </div>
              <div className="hero-stat">
                <p className="metric-label">With Phone</p>
                <p className="hero-stat-value">{customersWithPhone}</p>
              </div>
              <div className="hero-stat">
                <p className="metric-label">With Email</p>
                <p className="hero-stat-value">{customersWithEmail}</p>
              </div>
            </div>
          </div>

          <div className="surface-card-soft flex flex-col justify-between gap-4 p-4 sm:p-5">
            <div className="search-field">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Search by name, phone, or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="search-input"
              />
            </div>

            <div className="rounded-2xl bg-zinc-950 px-4 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Customer Flow</p>
                  <p className="mt-2 text-sm text-white/80">
                    Keep your directory updated so billing and follow-up stay quick and reliable.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 text-orange-300">
                  <Users size={18} />
                </div>
              </div>
            </div>

            {canManageCustomers ? (
              <button
                onClick={openAddModal}
                className="btn-primary w-full bg-orange-600 shadow-lg shadow-orange-200 hover:bg-orange-700"
              >
                <Plus size={18} className="mr-2" />
                Add Customer
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="table-shell">
        <div className="data-grid-head md:grid-cols-[minmax(0,2.1fr)_minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto]">
            <span>Customer</span>
            <span>Phone</span>
            <span>Email</span>
            <span>Address</span>
            <span className="text-right">Actions</span>
          </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 text-xs font-medium text-zinc-500 sm:px-6">
          <p>
            Showing {pageStart}-{pageEnd} of {pagination.totalItems} customers
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={!pagination.hasPreviousPage || isLoading}
              className={cn(
                "rounded-xl border px-3 py-1.5 font-semibold transition",
                pagination.hasPreviousPage && !isLoading
                  ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  : "cursor-not-allowed border-zinc-100 bg-zinc-100 text-zinc-400",
              )}
            >
              Prev
            </button>
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-zinc-600">
              Page {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!pagination.hasNextPage || isLoading}
              className={cn(
                "rounded-xl border px-3 py-1.5 font-semibold transition",
                pagination.hasNextPage && !isLoading
                  ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  : "cursor-not-allowed border-zinc-100 bg-zinc-100 text-zinc-400",
              )}
            >
              Next
            </button>
          </div>
        </div>

        <div>
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="data-row md:grid-cols-[minmax(0,2.1fr)_minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                  <User size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-zinc-950">{customer.name}</h3>
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      {customer.id.slice(-6).toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Customer profile ready for billing and follow-up.</p>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-600">
                <Phone size={14} className="shrink-0 text-zinc-400" />
                <span className="truncate">{customer.phone || "No phone"}</span>
              </div>

              <div className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-600">
                <Mail size={14} className="shrink-0 text-zinc-400" />
                <span className="truncate">{customer.email || "No email"}</span>
              </div>

              <div className="flex min-w-0 items-start gap-2.5 text-sm text-zinc-600">
                <MapPin size={14} className="mt-0.5 shrink-0 text-zinc-400" />
                <span className="line-clamp-2 leading-5">{customer.address || "No address"}</span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/customers/${customer.id}/history`)}
                  className="btn-secondary px-3 py-2 text-xs"
                >
                  <History size={14} className="mr-2" />
                  History
                </button>

                {canManageCustomers ? (
                  <button
                    type="button"
                    onClick={() => openEditModal(customer)}
                    className="btn-primary px-3 py-2 text-xs"
                    aria-label={`Edit ${customer.name}`}
                  >
                    <PencilLine size={14} className="mr-2" />
                    Edit
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          {!customers.length ? (
            <div className="empty-state m-5 sm:m-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-zinc-100 text-zinc-400">
                <Users size={26} />
              </div>
              <p className="mt-5 text-lg font-semibold text-zinc-900">{isLoading ? "Loading customers..." : "No customers matched your search"}</p>
              <p className="mt-2 text-sm text-zinc-500">
                {isLoading ? "Please wait while we fetch your customer list." : "Try a different name, phone number, or email keyword."}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="surface-card w-full max-w-md p-8">
            <h2 className="mb-6 text-xl font-bold text-zinc-900">
              {editingCustomer ? "Edit Customer" : "Add New Customer"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Full Name</label>
                <input
                  required
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Phone Number</label>
                <input
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Email</label>
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Address</label>
                <textarea
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  className="textarea-base"
                  rows={3}
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={cn(
                    "btn-primary flex-1 bg-orange-600 hover:bg-orange-700",
                    isSaving ? "cursor-not-allowed opacity-60" : "",
                  )}
                >
                  {isSaving ? "Saving..." : editingCustomer ? "Update Customer" : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
