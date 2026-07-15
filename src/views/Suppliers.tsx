import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "../components/OutletContext";
import { Mail, Phone, Plus, Search, Truck, Pencil, Trash2, Package, Ruler, Square, Link2, Boxes, Check, Sparkles, Clock, FileText, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, cn } from "../lib/utils";

type SupplierStatus = "ACTIVE" | "INACTIVE";
type SupplierTab = "records" | "history" | "items" | "add";

type Supplier = {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  paymentTerms?: string | null;
  leadTimeDays?: number | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  notes?: string | null;
  status: SupplierStatus;
};

type SupplierSupplyItem = {
  id: string;
  supplierId: string;
  name: string;
};

type SupplierSupplyRecord = {
  id: string;
  supplierId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  suppliedAt: string;
  createdAt: string;
};

type InventoryProduct = {
  id: string;
  name: string;
  sku: string;
  unitType: string;
  buyingPrice: number;
  currentStock: number;
  rollLengthFeet?: number | null;
  rollWidthFeet?: number | null;
  supplierId?: string | null;
  isService: boolean;
  status: string;
};

type SupplierFormState = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  paymentTerms: string;
  leadTimeDays: string;
  bankName: string;
  bankAccountNumber: string;
  notes: string;
  status: SupplierStatus;
};

type HistoryFormState = {
  productId: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  suppliedAt: string;
  notes: string;
};

type HistoryDraftRow = HistoryFormState & {
  draftId: string;
};

type SupplierItemFormState = {
  name: string;
  inventoryMode: "link_existing" | "create_new";
  productId: string;
  unitType: string;
  buyingPrice: string;
  minimumStockThreshold: string;
  rollLengthFeet: string;
};

function createEmptySupplierForm(): SupplierFormState {
  return {
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    taxNumber: "",
    paymentTerms: "",
    leadTimeDays: "",
    bankName: "",
    bankAccountNumber: "",
    notes: "",
    status: "ACTIVE",
  };
}

function createEmptySupplierItemForm(): SupplierItemFormState {
  return {
    name: "",
    inventoryMode: "create_new",
    productId: "",
    unitType: "UNIT",
    buyingPrice: "",
    minimumStockThreshold: "0",
    rollLengthFeet: "",
  };
}

function getTodayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function createHistoryForm(itemName = "", unitPrice = ""): HistoryFormState {
  return {
    productId: "",
    itemName,
    quantity: "",
    unitPrice,
    suppliedAt: getTodayInputValue(),
    notes: "",
  };
}

function createHistoryDraft(itemName = "", unitPrice = ""): HistoryDraftRow {
  return {
    draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...createHistoryForm(itemName, unitPrice),
  };
}

function toSupplierFormState(supplier: Supplier): SupplierFormState {
  return {
    name: supplier.name,
    contactPerson: supplier.contactPerson ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    taxNumber: supplier.taxNumber ?? "",
    paymentTerms: supplier.paymentTerms ?? "",
    leadTimeDays: supplier.leadTimeDays != null ? String(supplier.leadTimeDays) : "",
    bankName: supplier.bankName ?? "",
    bankAccountNumber: supplier.bankAccountNumber ?? "",
    notes: supplier.notes ?? "",
    status: supplier.status ?? "ACTIVE",
  };
}

function toSupplierPayload(form: SupplierFormState) {
  return {
    name: form.name,
    contactPerson: form.contactPerson || null,
    phone: form.phone || null,
    email: form.email || null,
    address: form.address || null,
    taxNumber: form.taxNumber || null,
    paymentTerms: form.paymentTerms || null,
    leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : null,
    bankName: form.bankName || null,
    bankAccountNumber: form.bankAccountNumber || null,
    notes: form.notes || null,
    status: form.status,
  };
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getInventoryProductOptionLabel(product: InventoryProduct) {
  return `${product.name} (${product.sku})${product.supplierId ? " • linked" : ""}`;
}

function SupplierFormModal({
  title,
  submitLabel,
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  value: SupplierFormState;
  onChange: (value: SupplierFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <h2 className="text-xl font-bold text-zinc-900">{title}</h2>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Company Name</label>
            <input
              required
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Contact Person</label>
            <input
              value={value.contactPerson}
              onChange={(event) => onChange({ ...value, contactPerson: event.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Phone</label>
            <input
              value={value.phone}
              onChange={(event) => onChange({ ...value, phone: event.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Email</label>
            <input
              type="email"
              value={value.email}
              onChange={(event) => onChange({ ...value, email: event.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Status</label>
            <select
              value={value.status}
              onChange={(event) => onChange({ ...value, status: event.target.value as SupplierStatus })}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Notes</label>
            <textarea
              rows={4}
              value={value.notes}
              onChange={(event) => onChange({ ...value, notes: event.target.value })}
              placeholder="Basic supplier notes"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="md:col-span-2 flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const SUPPLIER_UNIT_OPTIONS = [
  { value: "UNIT", label: "Units", hint: "Pieces / items", icon: Package },
  { value: "FEET", label: "Feet", hint: "By length", icon: Ruler },
  { value: "SQFT", label: "Sqft", hint: "By area", icon: Square },
] as const;

function getUnitMeta(unitType: string) {
  switch (unitType) {
    case "FEET":
      return { per: "per foot", noun: "feet" };
    case "SQFT":
      return { per: "per sqft", noun: "sqft" };
    default:
      return { per: "per unit", noun: "units" };
  }
}

function SupplierItemModal({
  value,
  onChange,
  onClose,
  onSubmit,
  inventoryProducts,
}: {
  value: SupplierItemFormState;
  onChange: (value: SupplierItemFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  inventoryProducts: InventoryProduct[];
}) {
  const isCreate = value.inventoryMode === "create_new";
  const unitMeta = getUnitMeta(value.unitType);
  const linkedProduct = inventoryProducts.find((item) => item.id === value.productId) ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-zinc-100 bg-gradient-to-r from-orange-50 to-white px-6 py-5 sm:px-8">
          <div className="inline-flex rounded-2xl bg-orange-600 p-3 text-white shadow-lg shadow-orange-200">
            <Boxes size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Add Supplier Item</h2>
            <p className="mt-0.5 text-sm text-zinc-500">Keep your supplier list and inventory perfectly in sync.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 px-6 py-6 sm:px-8">
          {/* Item name */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">Item Name</label>
            <input
              required
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder="e.g. Flex banner roll"
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm transition-all focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </div>

          {/* Mode selector */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">How should we track it?</label>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { mode: "create_new", icon: Sparkles, title: "Create new item", desc: "Add a brand new material to inventory" },
                { mode: "link_existing", icon: Link2, title: "Link existing item", desc: "Connect to a material you already stock" },
              ] as const).map((option) => {
                const active = value.inventoryMode === option.mode;
                const Icon = option.icon;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => onChange({ ...value, inventoryMode: option.mode })}
                    className={cn(
                      "group relative flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all",
                      active
                        ? "border-orange-500 bg-orange-50/70 shadow-sm"
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                    )}
                  >
                    <span className={cn(
                      "inline-flex rounded-xl p-2 transition-colors",
                      active ? "bg-orange-600 text-white" : "bg-zinc-100 text-zinc-500",
                    )}>
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-zinc-900">{option.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-zinc-500">{option.desc}</span>
                    </span>
                    {active && (
                      <span className="absolute right-3 top-3 inline-flex rounded-full bg-orange-600 p-0.5 text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {value.inventoryMode === "link_existing" ? (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">Existing Inventory Item</label>
              <select
                required
                value={value.productId}
                onChange={(event) => {
                  const product = inventoryProducts.find((item) => item.id === event.target.value) ?? null;
                  onChange({
                    ...value,
                    productId: event.target.value,
                    name: product?.name ?? value.name,
                    buyingPrice: product ? String(product.buyingPrice ?? 0) : value.buyingPrice,
                  });
                }}
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm transition-all focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-100"
              >
                <option value="">Select inventory item</option>
                {inventoryProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
              {linkedProduct && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  <Check size={14} strokeWidth={3} />
                  Linked to {linkedProduct.name} — buying price LKR {Number(linkedProduct.buyingPrice ?? 0).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 sm:p-5">
              {/* Unit type cards */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">Measured in</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {SUPPLIER_UNIT_OPTIONS.map((option) => {
                    const active = value.unitType === option.value;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange({ ...value, unitType: option.value })}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center transition-all",
                          active
                            ? "border-orange-500 bg-white shadow-sm"
                            : "border-transparent bg-white/70 hover:bg-white",
                        )}
                      >
                        <span className={cn(
                          "inline-flex rounded-xl p-2 transition-colors",
                          active ? "bg-orange-600 text-white" : "bg-zinc-100 text-zinc-500",
                        )}>
                          <Icon size={18} />
                        </span>
                        <span className={cn("text-sm font-bold", active ? "text-zinc-900" : "text-zinc-600")}>{option.label}</span>
                        <span className="text-[10px] leading-tight text-zinc-400">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Buying price */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">Buying Price</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-400">LKR</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={value.buyingPrice}
                      onChange={(event) => onChange({ ...value, buyingPrice: event.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-12 pr-20 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">{unitMeta.per}</span>
                  </div>
                </div>

                {/* Min threshold */}
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">Low-stock Alert At</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={value.minimumStockThreshold}
                      onChange={(event) => onChange({ ...value, minimumStockThreshold: event.target.value })}
                      placeholder="0"
                      className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-4 pr-16 text-sm transition-all focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">{unitMeta.noun}</span>
                  </div>
                </div>
              </div>

              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Sparkles size={13} className="text-orange-500" />
                A new inventory material will be created and measured in <span className="font-semibold text-zinc-700">{unitMeta.noun}</span>. SKU is generated automatically.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[1.5] rounded-2xl bg-orange-600 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-700"
            >
              Save Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  tone = "danger",
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "neutral";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-zinc-200 bg-white p-6 shadow-2xl sm:p-7">
        <div className={cn(
          "inline-flex rounded-2xl p-3",
          tone === "danger" ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-700",
        )}>
          <Trash2 size={20} />
        </div>
        <h2 className="mt-4 text-xl font-bold text-zinc-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "flex-1 rounded-xl py-3 text-sm font-bold text-white",
              tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const { user } = useOutletContext<{ user: any }>();
  const canManageSuppliers = Boolean(user);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierItems, setSupplierItems] = useState<SupplierSupplyItem[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>([]);
  const [historyRecords, setHistoryRecords] = useState<SupplierSupplyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [activeTab, setActiveTab] = useState<SupplierTab>("records");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedItemName, setSelectedItemName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingHistoryBatch, setSavingHistoryBatch] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<SupplierSupplyRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: "supplier"; supplier: Supplier }
    | { type: "item"; item: SupplierSupplyItem }
    | null
  >(null);
  const [newSupplierItem, setNewSupplierItem] = useState<SupplierItemFormState>(createEmptySupplierItemForm());
  const [newSupplier, setNewSupplier] = useState<SupplierFormState>(createEmptySupplierForm());
  const [editSupplier, setEditSupplier] = useState<SupplierFormState>(createEmptySupplierForm());
  const [historyDrafts, setHistoryDrafts] = useState<HistoryDraftRow[]>([createHistoryDraft()]);

  const loadSuppliers = async () => {
    const suppliersData = await apiFetch("/suppliers");
    setSuppliers(suppliersData);
    setSelectedSupplierId((current) =>
      current && suppliersData.some((supplier: Supplier) => supplier.id === current)
        ? current
        : suppliersData[0]?.id ?? "",
    );
  };

  const loadInventoryProducts = async () => {
    const products = await apiFetch("/products?status=ALL");
    setInventoryProducts(products.filter((product: InventoryProduct) => !product.isService && product.status === "ACTIVE"));
  };

  const loadHistory = async (supplierId: string) => {
    if (!supplierId) {
      setHistoryRecords([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const records = await apiFetch(`/suppliers/${supplierId}/history`);
      setHistoryRecords(records);
    } catch (err: any) {
      toast.error(err.message);
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSupplierItems = async (supplierId: string) => {
    if (!supplierId) {
      setSupplierItems([]);
      return;
    }

    try {
      const items = await apiFetch(`/suppliers/${supplierId}/items`);
      setSupplierItems(items);
    } catch (err: any) {
      toast.error(err.message);
      setSupplierItems([]);
    }
  };

  useEffect(() => {
    void Promise.all([loadSuppliers(), loadInventoryProducts()]).catch((err: any) => {
      toast.error(err.message);
    });
  }, []);

  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierItems([]);
      setSelectedItemName("");
      setHistoryDrafts([createHistoryDraft()]);
      return;
    }

    void loadHistory(selectedSupplierId);
    void loadSupplierItems(selectedSupplierId);
  }, [selectedSupplierId]);

  useEffect(() => {
    setSelectedItemName((current) => {
      return current && supplierItems.some((item) => item.name === current)
        ? current
        : supplierItems[0]?.name ?? "";
    });
  }, [supplierItems]);

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter((supplier) =>
        [supplier.name, supplier.contactPerson, supplier.phone, supplier.email]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(search.toLowerCase())),
      ),
    [search, suppliers],
  );

  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null;

  const filteredSupplierItems = useMemo(
    () =>
      supplierItems.filter((item) => item.name.toLowerCase().includes(itemSearch.toLowerCase())),
    [itemSearch, supplierItems],
  );

  const availableInventoryProducts = useMemo(() => {
    return [...inventoryProducts].sort((left, right) => {
      const leftLinked = left.supplierId === selectedSupplierId ? 1 : 0;
      const rightLinked = right.supplierId === selectedSupplierId ? 1 : 0;

      if (leftLinked !== rightLinked) {
        return rightLinked - leftLinked;
      }

      return left.name.localeCompare(right.name);
    });
  }, [inventoryProducts, selectedSupplierId]);

  const historyStats = useMemo(() => {
    const totalQuantity = historyRecords.reduce((sum, record) => sum + record.quantity, 0);
    const totalValue = historyRecords.reduce((sum, record) => sum + record.quantity * record.unitPrice, 0);

    return {
      totalEntries: historyRecords.length,
      totalQuantity,
      totalValue,
    };
  }, [historyRecords]);

  const itemLastRecordMap = useMemo(() => {
    const map = new Map<string, SupplierSupplyRecord>();
    for (const record of historyRecords) {
      const key = record.itemName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, record);
      }
    }
    return map;
  }, [historyRecords]);

  const inventoryProductMap = useMemo(
    () => new Map(availableInventoryProducts.map((product) => [product.id, product])),
    [availableInventoryProducts],
  );

  const handleSelectItem = (itemName: string) => {
    setSelectedItemName(itemName);
  };

  const updateHistoryDraft = (draftId: string, field: keyof HistoryFormState, value: string) => {
    setHistoryDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId
          ? {
              ...draft,
              [field]: value,
            }
          : draft,
      ),
    );
  };

  const handleSelectInventoryProduct = (draftId: string, productId: string) => {
    const product = inventoryProductMap.get(productId);
    setHistoryDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId
          ? {
              ...draft,
              productId,
              itemName: product?.name ?? "",
              unitPrice: product ? String(product.buyingPrice ?? 0) : draft.unitPrice,
            }
          : draft,
      ),
    );
  };

  const appendHistoryDraft = () => {
    setHistoryDrafts((current) => [...current, createHistoryDraft()]);
  };

  const removeHistoryDraft = (draftId: string) => {
    setHistoryDrafts((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((draft) => draft.draftId !== draftId);
    });
  };

  const handleAddSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify(toSupplierPayload(newSupplier)),
      });
      setNewSupplier(createEmptySupplierForm());
      setShowAdd(false);
      toast.success("Supplier added successfully");
      await loadSuppliers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplierId) {
      return;
    }

    try {
      await apiFetch(`/suppliers/${selectedSupplierId}`, {
        method: "PUT",
        body: JSON.stringify(toSupplierPayload(editSupplier)),
      });
      setShowEdit(false);
      toast.success("Supplier updated successfully");
      await loadSuppliers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteSupplier = async () => {
    const supplier = confirmDelete?.type === "supplier" ? confirmDelete.supplier : selectedSupplier;
    if (!supplier) {
      return;
    }

    try {
      const deletedSupplierId = supplier.id;
      const result = await apiFetch(`/suppliers/${deletedSupplierId}`, {
        method: "DELETE",
      });
      setHistoryRecords([]);
      setSupplierItems([]);
      setSelectedItemName("");
      setSelectedHistoryRecord(null);
      setConfirmDelete(null);
      toast.success(result?.message || "Supplier deleted successfully");
      await loadSuppliers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddSupplierItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplierId) {
      toast.error("Select a supplier first");
      return;
    }

    try {
      const normalized = newSupplierItem.name.trim();
      if (!normalized) {
        toast.error("Item name is required");
        return;
      }

      if (supplierItems.some((item) => item.name.toLowerCase() === normalized.toLowerCase())) {
        toast.error("This item name already exists for the supplier");
        return;
      }

      if (newSupplierItem.inventoryMode === "link_existing" && !newSupplierItem.productId) {
        toast.error("Select an existing inventory item");
        return;
      }

      if (
        newSupplierItem.inventoryMode === "create_new" &&
        newSupplierItem.unitType === "ROLL" &&
        (!newSupplierItem.rollLengthFeet || Number(newSupplierItem.rollLengthFeet) <= 0)
      ) {
        toast.error("Enter a valid roll length (feet)");
        return;
      }

      const createdItem = await apiFetch(`/suppliers/${selectedSupplierId}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: normalized,
          productId: newSupplierItem.inventoryMode === "link_existing" ? newSupplierItem.productId : null,
          unitType: newSupplierItem.inventoryMode === "create_new" ? newSupplierItem.unitType : null,
          buyingPrice: newSupplierItem.buyingPrice ? Number(newSupplierItem.buyingPrice) : null,
          minimumStockThreshold: newSupplierItem.minimumStockThreshold ? Number(newSupplierItem.minimumStockThreshold) : 0,
          rollLengthFeet:
            newSupplierItem.inventoryMode === "create_new" && newSupplierItem.unitType === "ROLL" && newSupplierItem.rollLengthFeet
              ? Number(newSupplierItem.rollLengthFeet)
              : null,
        }),
      });
      setSupplierItems((current) => [...current, createdItem].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Supplier item synced with inventory");
      setShowAddItem(false);
      setNewSupplierItem(createEmptySupplierItemForm());
      handleSelectItem(normalized);
      await loadInventoryProducts();
      setHistoryDrafts((current) =>
        current.map((draft, index) => (index === 0 ? { ...draft, itemName: normalized } : draft)),
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteSupplierItem = async (item: SupplierSupplyItem) => {
    if (!selectedSupplierId) {
      return;
    }

    try {
      const result = await apiFetch(`/suppliers/${selectedSupplierId}/items/${item.id}`, {
        method: "DELETE",
      });
      setSupplierItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedItemName((current) => (current === item.name ? "" : current));
      setConfirmDelete(null);
      toast.success(result?.message || "Supplier item deleted successfully");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddHistory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSupplierId) {
      toast.error("Select a supplier first");
      return;
    }

    const trimmedDrafts = historyDrafts
      .map((draft) => ({
        ...draft,
        itemName: draft.itemName.trim(),
      }))
      .filter((draft) => draft.productId || draft.itemName || draft.quantity || draft.unitPrice || draft.notes);

    if (!trimmedDrafts.length) {
      toast.error("Add at least one record");
      return;
    }

    for (const draft of trimmedDrafts) {
      if (!draft.productId) {
        toast.error("Select an inventory item for each record");
        return;
      }

      const product = inventoryProductMap.get(draft.productId);
      if (!product) {
        toast.error("One or more selected inventory items are invalid");
        return;
      }

      if (!draft.itemName) {
        toast.error("Item name is required for each record");
        return;
      }

      if (!draft.quantity || Number(draft.quantity) <= 0) {
        toast.error(`Enter valid quantity for ${draft.itemName}`);
        return;
      }
    }

    setSavingHistoryBatch(true);
    try {
      const payload = trimmedDrafts.map((draft) => {
        const product = inventoryProductMap.get(draft.productId);
        return {
          productId: draft.productId,
          itemName: draft.itemName,
          quantity: Number(draft.quantity),
          unitPrice: Number(product?.buyingPrice ?? draft.unitPrice ?? 0),
          suppliedAt: draft.suppliedAt,
          notes: draft.notes || null,
        };
      });

      const created = await apiFetch(`/suppliers/${selectedSupplierId}/history`, {
        method: "POST",
        body: JSON.stringify({
          records: payload,
        }),
      });

      const createdRows = Array.isArray(created) ? created : [created];
      setHistoryRecords((current) => [...createdRows, ...current]);
      await loadSupplierItems(selectedSupplierId);
      await loadInventoryProducts();
      toast.success(`${createdRows.length} supplier record${createdRows.length > 1 ? "s" : ""} saved`);
      setHistoryDrafts([createHistoryDraft()]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingHistoryBatch(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Suppliers</h1>
          <p className="text-zinc-500">Keep supplier records separate, searchable, and easy to update.</p>
        </div>
        {canManageSuppliers ? (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-700"
          >
            <Plus size={18} className="mr-2" />
            Add Supplier
          </button>
        ) : null}
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { id: "records" as const, label: "Details", icon: FileText },
            { id: "items" as const, label: "Items", icon: Boxes },
            { id: "add" as const, label: "Record Stock", icon: PackagePlus },
            { id: "history" as const, label: "History", icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-all",
                  active
                    ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200"
                    : "text-zinc-500 hover:bg-zinc-100",
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredSuppliers.length ? (
              filteredSuppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  onClick={() => setSelectedSupplierId(supplier.id)}
                  className={cn(
                    "w-full rounded-3xl border p-5 text-left shadow-sm transition-all",
                    selectedSupplierId === supplier.id
                      ? "border-orange-300 bg-orange-50/60 shadow-orange-100"
                      : "border-zinc-200 bg-white hover:border-zinc-300",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{supplier.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{supplier.contactPerson || "No contact person"}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold",
                        supplier.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-600",
                      )}
                    >
                      {supplier.status}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-zinc-600">
                    <p>{supplier.phone || "No phone"}</p>
                    <p>{supplier.email || "No email"}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                No suppliers found.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {selectedSupplier ? (
            <>
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                        <Truck size={22} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-zinc-900">{selectedSupplier.name}</h2>
                        <p className="text-sm text-zinc-500">{selectedSupplier.contactPerson || "No contact person"}</p>
                      </div>
                    </div>
                  </div>
                  {canManageSuppliers ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setEditSupplier(toSupplierFormState(selectedSupplier));
                          setShowEdit(true);
                        }}
                        className="inline-flex items-center rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
                      >
                        <Pencil size={16} className="mr-2" />
                        Edit Supplier
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ type: "supplier", supplier: selectedSupplier })}
                        className="inline-flex items-center rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
                      >
                        <Trash2 size={16} className="mr-2" />
                        Delete Supplier
                      </button>
                    </div>
                  ) : null}
                </div>

                {activeTab !== "records" ? (
                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Saved Items</p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">{supplierItems.length}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">History Entries</p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">{historyStats.totalEntries}</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Value</p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">{formatCurrency(historyStats.totalValue)}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {activeTab === "records" ? (
                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-zinc-900">Contact Details</h3>
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Phone</p>
                      <p className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
                        <Phone size={14} className="text-zinc-400" />
                        {selectedSupplier.phone || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Email</p>
                      <p className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
                        <Mail size={14} className="text-zinc-400" />
                        {selectedSupplier.email || "Not set"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-zinc-50 p-4 md:col-span-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Notes</p>
                      <p className="mt-2 text-sm text-zinc-700">{selectedSupplier.notes || "No notes added"}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "history" ? (
                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Supplier History</h3>
                    <p className="text-sm text-zinc-500">View supplied items, quantity, price, and notes for {selectedSupplier.name}.</p>
                  </div>

                  {historyLoading ? (
                    <div className="mt-6 rounded-2xl bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                      Loading history...
                    </div>
                  ) : historyRecords.length ? (
                    <div className="mt-6 space-y-3">
                      {historyRecords.map((record) => {
                        const lineTotal = record.quantity * record.unitPrice;
                        return (
                          <button
                            key={record.id}
                            type="button"
                            onClick={() => setSelectedHistoryRecord(record)}
                            className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-left transition-all hover:border-zinc-300 hover:bg-white"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <p className="text-base font-bold text-zinc-900">{record.itemName}</p>
                                <p className="mt-1 text-sm text-zinc-500">{formatDate(record.suppliedAt)}</p>
                              </div>
                              <div className="text-left lg:text-right">
                                <p className="text-sm font-bold text-zinc-900">{formatCurrency(lineTotal)}</p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {formatQuantity(record.quantity)} x {formatCurrency(record.unitPrice)}
                                </p>
                              </div>
                            </div>
                            {record.notes ? (
                              <p className="mt-3 text-sm text-zinc-600">{record.notes}</p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                      No supplier history yet.
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "items" ? (
                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                        <Boxes size={20} />
                      </div>
                      <div>
                        <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
                          Items
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
                            {supplierItems.length}
                          </span>
                        </h3>
                        <p className="text-sm text-zinc-500">Materials you buy from {selectedSupplier.name}.</p>
                      </div>
                    </div>
                    {canManageSuppliers ? (
                      <button
                        onClick={() => setShowAddItem(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-700"
                      >
                        <Plus size={16} />
                        Add Item
                      </button>
                    ) : null}
                  </div>

                  {supplierItems.length > 0 ? (
                    <div className="mt-5 relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                      <input
                        type="text"
                        placeholder="Search items..."
                        value={itemSearch}
                        onChange={(event) => setItemSearch(event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  ) : null}

                  {supplierItems.length === 0 ? (
                    <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-10 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm">
                        <Package size={22} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-700">No items yet</p>
                        <p className="mt-1 text-sm text-zinc-500">Add the materials you regularly buy from this supplier.</p>
                      </div>
                      {canManageSuppliers ? (
                        <button
                          onClick={() => setShowAddItem(true)}
                          className="mt-1 inline-flex items-center gap-2 rounded-2xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
                        >
                          <Plus size={16} />
                          Add your first item
                        </button>
                      ) : null}
                    </div>
                  ) : filteredSupplierItems.length ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {filteredSupplierItems.map((item) => {
                        const lastRecord = itemLastRecordMap.get(item.name.toLowerCase()) ?? null;
                        return (
                          <div
                            key={item.id}
                            className="group flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition-all hover:border-orange-200 hover:bg-white hover:shadow-sm"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-400 shadow-sm">
                              <Package size={18} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-zinc-800">{item.name}</p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500">
                                {lastRecord
                                  ? `Last: ${formatCurrency(lastRecord.unitPrice)} • ${formatDate(lastRecord.suppliedAt)}`
                                  : "No supply records yet"}
                              </p>
                            </div>
                            {canManageSuppliers ? (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete({ type: "item", item })}
                                className="rounded-lg p-2 text-zinc-300 transition-all hover:bg-red-50 hover:text-red-600 group-hover:text-zinc-400"
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
                      No items match &ldquo;{itemSearch}&rdquo;.
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === "add" ? (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-zinc-900">Add Record</h3>
                        <p className="text-sm text-zinc-500">Select an item name, then enter quantity and price.</p>
                      </div>
                      <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                        Draft Rows: <span className="font-bold text-zinc-900">{historyDrafts.length}</span>
                      </div>
                    </div>

                    <form onSubmit={handleAddHistory} className="mt-6 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2 space-y-3">
                        {historyDrafts.map((draft, index) => {
                          const lastRecord = draft.itemName
                            ? itemLastRecordMap.get(draft.itemName.toLowerCase()) ?? null
                            : null;
                          const selectedProduct = draft.productId ? inventoryProductMap.get(draft.productId) ?? null : null;
                          const isRollProduct = selectedProduct?.unitType === "ROLL";
                          const hasRollLength = Boolean(selectedProduct?.rollLengthFeet && selectedProduct.rollLengthFeet > 0);
                          const isBannerRoll = isRollProduct;
                          const projectedRollFeet =
                            isRollProduct && hasRollLength
                              ? Number((Number(draft.quantity || 0) * Number(selectedProduct?.rollLengthFeet || 0)).toFixed(2))
                              : null;
                          const bannerRollCount =
                            isBannerRoll && hasRollLength
                              ? Number((Number(selectedProduct?.currentStock || 0) / Number(selectedProduct?.rollLengthFeet || 1)).toFixed(2))
                              : null;
                          return (
                            <div key={draft.draftId} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                              <div className="mb-3 flex items-center justify-between">
                                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                                  Record #{index + 1}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => removeHistoryDraft(draft.draftId)}
                                  className="text-xs font-bold text-red-600 hover:text-red-700 disabled:opacity-40"
                                  disabled={historyDrafts.length <= 1}
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="md:col-span-2">
                                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Inventory Item</label>
                                  <select
                                    required
                                    value={draft.productId}
                                    onChange={(event) => handleSelectInventoryProduct(draft.draftId, event.target.value)}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                                  >
                                    <option value="">Select inventory item</option>
                                    {availableInventoryProducts.map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {getInventoryProductOptionLabel(product)}
                                      </option>
                                    ))}
                                  </select>
                                  <p className="mt-2 text-xs text-zinc-500">
                                    Choose the inventory material to receive stock for this supplier record.
                                  </p>
                                  {selectedProduct ? (
                                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Current Stock</p>
                                        {isBannerRoll && hasRollLength ? (
                                          <>
                                            <p className="mt-1 text-sm font-bold text-zinc-900">
                                              {formatQuantity(selectedProduct.currentStock)} FEET
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-zinc-600">
                                              {formatQuantity(bannerRollCount || 0)} rolls
                                            </p>
                                          </>
                                        ) : (
                                          <p className="mt-1 text-sm font-bold text-zinc-900">
                                            {formatQuantity(selectedProduct.currentStock)} {selectedProduct.unitType}
                                          </p>
                                        )}
                                      </div>
                                      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Current Cost</p>
                                        <p className="mt-1 text-sm font-bold text-zinc-900">
                                          {formatCurrency(selectedProduct.buyingPrice)}
                                        </p>
                                      </div>
                                      <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Unit Type</p>
                                        <p className="mt-1 text-sm font-bold text-zinc-900">{selectedProduct.unitType}</p>
                                      </div>
                                    </div>
                                  ) : null}
                                  {isBannerRoll && hasRollLength ? (
                                    <p className="mt-2 text-xs text-zinc-500">
                                      {selectedProduct?.rollWidthFeet && selectedProduct.rollWidthFeet > 0
                                        ? `${formatQuantity(selectedProduct.rollWidthFeet)}ft width • `
                                        : ""}
                                      {formatQuantity(Number(selectedProduct?.rollLengthFeet || 0))}ft length •{" "}
                                      {formatQuantity(selectedProduct?.currentStock || 0)}ft stock
                                    </p>
                                  ) : null}
                                  {isRollProduct ? (
                                    <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                                      <p>
                                        Enter quantity as the number of rolls.
                                        {hasRollLength ? (
                                          <>
                                            {" "}Each roll is{" "}
                                            <span className="font-bold">{formatQuantity(Number(selectedProduct?.rollLengthFeet || 0))} ft</span>.
                                          </>
                                        ) : (
                                          " Add roll length to this product to auto-calculate feet."
                                        )}
                                      </p>
                                      {hasRollLength ? (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                          <div className="rounded-xl border border-orange-200 bg-white/70 p-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Number Of Rolls</p>
                                            <p className="mt-1 font-bold text-orange-900">{formatQuantity(Number(draft.quantity || 0))}</p>
                                          </div>
                                          <div className="rounded-xl border border-orange-200 bg-white/70 p-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Total Feet</p>
                                            <p className="mt-1 font-bold text-orange-900">{formatQuantity(projectedRollFeet || 0)} ft</p>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                                    {isRollProduct ? "Number Of Rolls" : `Quantity${selectedProduct ? ` (${selectedProduct.unitType})` : ""}`}
                                  </label>
                                  <input
                                    required
                                    type="number"
                                    min={0.01}
                                    step={0.01}
                                    value={draft.quantity}
                                    onChange={(event) => updateHistoryDraft(draft.draftId, "quantity", event.target.value)}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                                  />
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Applied Price</p>
                                  <p className="mt-2 text-sm font-bold text-zinc-900">
                                    {selectedProduct ? formatCurrency(selectedProduct.buyingPrice) : "Select item first"}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">Price is taken from inventory and cannot be changed here.</p>
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Supplied Date</label>
                                  <input
                                    required
                                    type="date"
                                    value={draft.suppliedAt}
                                    onChange={(event) => updateHistoryDraft(draft.draftId, "suppliedAt", event.target.value)}
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                                  />
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Last Price</p>
                                  <p className="mt-2 text-sm font-bold text-zinc-900">
                                    {lastRecord ? formatCurrency(lastRecord.unitPrice) : "No previous record"}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {lastRecord ? formatDate(lastRecord.suppliedAt) : "No history for this item yet"}
                                  </p>
                                </div>

                                <div className="md:col-span-2">
                                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Notes</label>
                                  <textarea
                                    rows={2}
                                    value={draft.notes}
                                    onChange={(event) => updateHistoryDraft(draft.draftId, "notes", event.target.value)}
                                    placeholder="Optional note"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-start">
                          <button
                            type="button"
                            onClick={appendHistoryDraft}
                            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                          >
                            + Add Another Record
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                          Each saved supplier record now updates the selected inventory item stock, refreshes its buying price, and stores supplier history in one step.
                        </p>
                      </div>

                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={!canManageSuppliers || savingHistoryBatch}
                            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                          >
                            {savingHistoryBatch ? "Saving..." : "Save All Records"}
                          </button>
                        </div>
                      </form>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500 shadow-sm">
              Add a supplier to begin.
            </div>
          )}
        </div>
      </div>

      {showAdd ? (
        <SupplierFormModal
          title="Add Supplier"
          submitLabel="Save Supplier"
          value={newSupplier}
          onChange={setNewSupplier}
          onClose={() => setShowAdd(false)}
          onSubmit={handleAddSupplier}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmModal
          title={confirmDelete.type === "supplier" ? "Delete Supplier" : "Delete Supplier Item"}
          description={
            confirmDelete.type === "supplier"
              ? `Delete "${confirmDelete.supplier.name}"? This removes the supplier and detaches linked products from it.`
              : `Delete "${confirmDelete.item.name}"? Existing history records will stay, but this saved item shortcut will be removed.`
          }
          confirmLabel={confirmDelete.type === "supplier" ? "Delete Supplier" : "Delete Item"}
          tone="danger"
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.type === "supplier") {
              void handleDeleteSupplier();
              return;
            }
            void handleDeleteSupplierItem(confirmDelete.item);
          }}
        />
      ) : null}

      {showEdit && selectedSupplier ? (
        <SupplierFormModal
          title={`Edit ${selectedSupplier.name}`}
          submitLabel="Update Supplier"
          value={editSupplier}
          onChange={setEditSupplier}
          onClose={() => setShowEdit(false)}
          onSubmit={handleUpdateSupplier}
        />
      ) : null}

      {showAddItem ? (
        <SupplierItemModal
          value={newSupplierItem}
          onChange={setNewSupplierItem}
          onClose={() => {
            setShowAddItem(false);
            setNewSupplierItem(createEmptySupplierItemForm());
          }}
          onSubmit={handleAddSupplierItem}
          inventoryProducts={inventoryProducts}
        />
      ) : null}

      {selectedHistoryRecord ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Supplier Record Details</h2>
                <p className="mt-1 text-sm text-zinc-500">{selectedSupplier?.name}</p>
              </div>
              <button
                onClick={() => setSelectedHistoryRecord(null)}
                className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-zinc-50 p-4 md:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Item Name</p>
                <p className="mt-2 text-base font-bold text-zinc-900">{selectedHistoryRecord.itemName}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Quantity</p>
                <p className="mt-2 text-sm font-bold text-zinc-900">{formatQuantity(selectedHistoryRecord.quantity)}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Unit Price</p>
                <p className="mt-2 text-sm font-bold text-zinc-900">{formatCurrency(selectedHistoryRecord.unitPrice)}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Supplied Date</p>
                <p className="mt-2 text-sm text-zinc-700">{formatDate(selectedHistoryRecord.suppliedAt)}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Line Total</p>
                <p className="mt-2 text-sm font-bold text-zinc-900">
                  {formatCurrency(selectedHistoryRecord.quantity * selectedHistoryRecord.unitPrice)}
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4 md:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Notes</p>
                <p className="mt-2 text-sm text-zinc-700">{selectedHistoryRecord.notes || "No notes"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
