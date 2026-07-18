import { useEffect, useState } from "react";
import { useOutletContext } from "../components/OutletContext";
import { apiFetch } from "../lib/utils";
import { 
  Plus, 
  Search, 
  AlertCircle,
  AlertTriangle,
  PackageCheck,
  Edit2,
  Trash2,
  SlidersHorizontal
} from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";

function formatQuantity(value: number) {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function createDefaultNewProduct() {
  return {
    name: "",
    sku: "",
    buyingPrice: 0,
    currentStock: 0,
    minimumStockThreshold: 5,
    rollCount: 0,
    rollLengthFeet: 0,
    rollWidthFeet: 0,
    isService: false,
    materialId: "",
    unitType: "UNIT",
  };
}

function createDefaultEditProduct() {
  return {
    name: "",
    sku: "",
    supplierId: "",
    buyingPrice: 0,
    minimumStockThreshold: 5,
    rollLengthFeet: 0,
    rollWidthFeet: 0,
    unitType: "UNIT",
    status: "ACTIVE",
  };
}

function createDefaultRestockData(overrides: Partial<{
  quantity: number;
  buyingPrice: number;
  supplierId: string;
  rollCount: number;
  rollLengthFeet: number;
}> = {}) {
  return {
    quantity: 0,
    buyingPrice: 0,
    supplierId: "",
    rollCount: 0,
    rollLengthFeet: 0,
    ...overrides,
  };
}

function createRestockDataForProduct(product: any) {
  return createDefaultRestockData({
    buyingPrice: product.buyingPrice,
    supplierId: product.supplierId || "",
    rollLengthFeet: product.unitType === "ROLL" ? product.rollLengthFeet || 0 : 0,
  });
}

function isPerUnitType(unitType: string) {
  return unitType === "UNIT";
}

function getUnitLabel(unitType: string) {
  return ["METER", "METERS", "METRE", "METRES", "FOOT", "FEET", "FEETS"].includes(unitType.trim().toUpperCase())
    ? "feet"
    : unitType.toLowerCase();
}

function getUnitPriceLabel(unitType: string) {
  return isPerUnitType(unitType) ? " / Unit" : "";
}

function getQuantityInputStep(unitType: string) {
  return isPerUnitType(unitType) ? 1 : 0.01;
}

function getRestockSuccessMessage(product: any, quantity: number, rollCount: number) {
  if (product?.unitType === "ROLL") {
    return `Added ${formatQuantity(rollCount)} rolls to ${product.name}`;
  }

  if (product?.unitType === "UNIT") {
    return `Added ${formatQuantity(quantity)} units to ${product.name}`;
  }

  return `Added ${formatQuantity(quantity)} ${getUnitLabel(product?.unitType || "items")} to ${product?.name || "product"}`;
}

export default function Inventory() {
  const { user } = useOutletContext<{ user: any }>();
  const canManageInventory = user.role === "ADMIN" || user.role === "INVENTORY_MANAGER";
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingProductId, setEditingProductId] = useState("");
  const [showRestock, setShowRestock] = useState<any>(null);
  const [showAdjust, setShowAdjust] = useState<any>(null);
  const [adjustData, setAdjustData] = useState<{ direction: "IN" | "OUT"; quantity: number; reason: string }>({
    direction: "OUT",
    quantity: 0,
    reason: "",
  });
  const [deleteModal, setDeleteModal] = useState<{
    type: "PRODUCT";
    id: string;
    name: string;
  } | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [newProduct, setNewProduct] = useState(createDefaultNewProduct);
  const [editProduct, setEditProduct] = useState(createDefaultEditProduct);
  const [restockData, setRestockData] = useState(createDefaultRestockData);

  const loadInventoryData = async () => {
    const [productsData, suppliersData] = await Promise.all([
      apiFetch("/products"),
      apiFetch("/suppliers"),
    ]);

    setProducts(productsData.filter((product: any) => !product.isService));
    setSuppliers(suppliersData);
  };

  useEffect(() => {
    void loadInventoryData();
  }, []);

  const isBannerRollProduct = (product: any) =>
    product?.unitType === "ROLL";

  const getBannerStockFeet = (product: any) => {
    if (!isBannerRollProduct(product)) {
      return null;
    }
    return Number((product.currentStock || 0).toFixed(2));
  };

  const getBannerThresholdFeet = (product: any) => {
    if (!isBannerRollProduct(product)) {
      return null;
    }
    return Number((product.minimumStockThreshold || 0).toFixed(2));
  };

  const getBannerRollCount = (product: any) => {
    if (!isBannerRollProduct(product)) {
      return null;
    }
    if (!product.rollLengthFeet || product.rollLengthFeet <= 0) {
      return null;
    }
    return Number((product.currentStock / product.rollLengthFeet).toFixed(2));
  };

  const getStockOptionLabel = (product: any) => {
    if (isBannerRollProduct(product)) {
      const feet = getBannerStockFeet(product);
      const rollCount = getBannerRollCount(product);
      if (feet != null) {
        return `${formatQuantity(feet)} feet${rollCount != null ? ` (${formatQuantity(rollCount)} rolls)` : ""}`;
      }
    }
    return `${formatQuantity(product.currentStock)} ${getUnitLabel(product.unitType)}`;
  };

  const isNewProductPerUnit = isPerUnitType(newProduct.unitType);
  const newProductBuyingValue = newProduct.currentStock * newProduct.buyingPrice;
  const isRestockingPerUnit = isPerUnitType(showRestock?.unitType || "");

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { sku: _sku, ...productPayload } = newProduct;
      const product = await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          ...productPayload,
          sellingPrice: 0,
          isService: false,
          materialId: "",
          rollCount: newProduct.unitType === "ROLL" ? newProduct.rollCount : null,
          rollLengthFeet: newProduct.unitType === "ROLL" && newProduct.rollLengthFeet > 0 ? newProduct.rollLengthFeet : null,
          rollWidthFeet: newProduct.unitType === "ROLL" && newProduct.rollWidthFeet > 0 ? newProduct.rollWidthFeet : null,
        }),
      });
      setProducts([...products, product]);
      setShowAdd(false);
      setNewProduct(createDefaultNewProduct());
      toast.success("Product added successfully");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const restockQuantity = isBannerRollRestock
        ? (restockData.rollCount || 0)
        : restockData.quantity;
      const payload = {
        productId: showRestock.id,
        quantity: restockData.quantity,
        buyingPrice: restockData.buyingPrice,
        supplierId: restockData.supplierId,
        ...(showRestock.unitType === "ROLL"
          ? {
              rollCount: restockData.rollCount,
              rollLengthFeet: restockData.rollLengthFeet,
            }
          : {}),
      };

      await apiFetch("/inventory/restock", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setShowRestock(null);
      toast.success(getRestockSuccessMessage(showRestock, restockQuantity, restockData.rollCount));
      await loadInventoryData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openAdjust = (product: any) => {
    setShowAdjust(product);
    setAdjustData({ direction: "OUT", quantity: 0, reason: "" });
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAdjust) {
      return;
    }
    try {
      await apiFetch("/inventory/adjust", {
        method: "POST",
        body: JSON.stringify({
          productId: showAdjust.id,
          direction: adjustData.direction,
          quantity: adjustData.quantity,
          reason: adjustData.reason,
        }),
      });
      const verb = adjustData.direction === "IN" ? "Added" : "Removed";
      toast.success(`${verb} ${formatQuantity(adjustData.quantity)} ${getUnitLabel(showAdjust.unitType)} — ${showAdjust.name}`);
      setShowAdjust(null);
      await loadInventoryData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEditProduct = (product: any) => {
    setEditingProductId(product.id);
    setEditProduct({
      name: product.name,
      sku: product.sku,
      supplierId: product.supplierId || "",
      buyingPrice: product.buyingPrice,
      minimumStockThreshold: product.minimumStockThreshold,
      rollLengthFeet: product.rollLengthFeet || 0,
      rollWidthFeet: product.rollWidthFeet || 0,
      unitType: product.unitType,
      status: product.status,
    });
    setShowEdit(true);
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) {
      return;
    }

    try {
      await apiFetch(`/products/${editingProductId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editProduct,
          sellingPrice: 0,
          isService: false,
          materialId: "",
          rollLengthFeet: editProduct.unitType === "ROLL" && editProduct.rollLengthFeet > 0 ? editProduct.rollLengthFeet : null,
          rollWidthFeet: editProduct.unitType === "ROLL" && editProduct.rollWidthFeet > 0 ? editProduct.rollWidthFeet : null,
        }),
      });
      setShowEdit(false);
      setEditingProductId("");
      toast.success("Product updated successfully");
      await loadInventoryData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const result = await apiFetch(`/products/${productId}`, { method: "DELETE" });
      toast.success(result?.message || "Product deleted successfully");
      await loadInventoryData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModal) {
      return;
    }

    const currentDelete = deleteModal;
    setDeleteModal(null);
    await handleDeleteProduct(currentDelete.id);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "ALL" || (filter === "LOW" && p.currentStock <= p.minimumStockThreshold);
    return matchesSearch && matchesFilter;
  });
  const isBannerRollRestock = Boolean(showRestock && showRestock.unitType === "ROLL");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Raw Materials Inventory</h1>
          <p className="text-zinc-500">Manage papers, banner rolls, stickers, and other raw materials used by POS products.</p>
        </div>
        {canManageInventory && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center justify-center rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-700"
            >
              <Plus size={18} className="mr-2" />
              Add Raw Material
            </button>
          </div>
        )}
      </div>

      {/* Modals */}

      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <h2 className="text-xl font-bold text-zinc-900 mb-6">Add Raw Material</h2>
            <form onSubmit={handleAddProduct} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Material Name</label>
                <input required value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div className="md:col-span-2">
                <p className="text-[11px] text-zinc-500">SKU will be generated automatically when you save.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Buying Price{getUnitPriceLabel(newProduct.unitType)} (LKR) - Optional</label>
                <input type="number" min={0} value={newProduct.buyingPrice} onChange={e => setNewProduct({...newProduct, buyingPrice: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
                {isNewProductPerUnit && newProduct.buyingPrice > 0 ? (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {formatQuantity(newProduct.currentStock)} units x LKR {formatCurrency(newProduct.buyingPrice)} = LKR {formatCurrency(newProductBuyingValue)}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{isNewProductPerUnit ? "Initial Units" : "Initial Stock"}</label>
                <input
                  type="number"
                  required
                  min={0}
                  step={getQuantityInputStep(newProduct.unitType)}
                  value={newProduct.currentStock}
                  onChange={e => setNewProduct({...newProduct, currentStock: Number(e.target.value)})}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{isNewProductPerUnit ? "Min. Threshold (Units)" : "Min. Threshold"}</label>
                <input type="number" min={0} step={getQuantityInputStep(newProduct.unitType)} required value={newProduct.minimumStockThreshold} onChange={e => setNewProduct({...newProduct, minimumStockThreshold: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Unit Type</label>
                <select value={newProduct.unitType} onChange={e => setNewProduct({...newProduct, unitType: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none">
                  <option value="UNIT">Per Unit</option>
                  <option value="SQFT">Per Sqft (Area)</option>
                  <option value="FEET">Per Feet (Length)</option>
                </select>
              </div>
              {isNewProductPerUnit && (
                <div className="md:col-span-2 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
                  <p className="text-sm font-bold text-zinc-900">Per-unit pricing summary</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Buying value</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {formatQuantity(newProduct.currentStock)} units x LKR {formatCurrency(newProduct.buyingPrice)}
                      </p>
                      <p className="mt-2 text-lg font-bold text-zinc-900">LKR {formatCurrency(newProductBuyingValue)}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Buying value</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {formatQuantity(newProduct.currentStock)} units x LKR {formatCurrency(newProduct.buyingPrice)}
                      </p>
                      <p className="mt-2 text-lg font-bold text-orange-600">LKR {formatCurrency(newProductBuyingValue)}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="md:col-span-2 flex flex-col gap-3 pt-4 sm:flex-row">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showEdit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <h2 className="text-xl font-bold text-zinc-900 mb-6">Edit Raw Material</h2>
            <form onSubmit={handleEditProduct} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Material Name</label>
                <input required value={editProduct.name} onChange={e => setEditProduct({...editProduct, name: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">SKU / Code</label>
                <input required value={editProduct.sku} onChange={e => setEditProduct({...editProduct, sku: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Supplier</label>
                <select value={editProduct.supplierId} onChange={e => setEditProduct({...editProduct, supplierId: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none">
                  <option value="">No Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Buying Price{getUnitPriceLabel(editProduct.unitType)} (LKR) - Optional</label>
                <input type="number" min={0} value={editProduct.buyingPrice} onChange={e => setEditProduct({...editProduct, buyingPrice: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{isPerUnitType(editProduct.unitType) ? "Min. Threshold (Units)" : "Min. Threshold"}</label>
                <input type="number" min={0} step={getQuantityInputStep(editProduct.unitType)} required value={editProduct.minimumStockThreshold} onChange={e => setEditProduct({...editProduct, minimumStockThreshold: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Unit Type</label>
                <select value={editProduct.unitType} onChange={e => setEditProduct({...editProduct, unitType: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none">
                  <option value="UNIT">Per Unit</option>
                  <option value="SQFT">Per Sqft (Area)</option>
                  <option value="FEET">Per Feet (Length)</option>
                  {/* Legacy: only selectable for materials already saved as Per Roll. New materials use Per Feet instead. */}
                  {editProduct.unitType === "ROLL" && <option value="ROLL">Per Roll (legacy)</option>}
                </select>
              </div>
              {editProduct.unitType === "ROLL" && (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Roll Width (ft)</label>
                    <input type="number" min={0.1} step={0.1} value={editProduct.rollWidthFeet} onChange={e => setEditProduct({...editProduct, rollWidthFeet: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Each Roll Length (ft)</label>
                    <input type="number" min={0.1} step={0.1} value={editProduct.rollLengthFeet} onChange={e => setEditProduct({...editProduct, rollLengthFeet: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Status</label>
                <select value={editProduct.status} onChange={e => setEditProduct({...editProduct, status: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <div className="md:col-span-2 flex flex-col gap-3 pt-4 sm:flex-row">
                <button type="button" onClick={() => setShowEdit(false)} className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800">Update Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRestock && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-zinc-900 mb-2">Restock Raw Material</h2>
            <p className="text-sm text-zinc-500 mb-6">{showRestock.name}</p>
            <form onSubmit={handleRestock} className="space-y-4">
              {!isBannerRollRestock ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">{isRestockingPerUnit ? "Units to Add" : "Quantity to Add"}</label>
                  <input type="number" min={0} step={getQuantityInputStep(showRestock?.unitType || "")} required value={restockData.quantity} onChange={e => setRestockData({...restockData, quantity: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {isRestockingPerUnit
                      ? `This will add ${formatQuantity(restockData.quantity)} units to stock.`
                      : `This will add ${formatQuantity(restockData.quantity)} ${getUnitLabel(showRestock.unitType)} to stock.`}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">How Many Rolls</label>
                    <input type="number" min={0} step={1} required value={restockData.rollCount} onChange={e => setRestockData({...restockData, rollCount: Number(e.target.value), quantity: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Will add: {formatQuantity((restockData.rollCount || 0) * (restockData.rollLengthFeet || 0))} feet
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Each Roll Length (ft)</label>
                    <input type="number" min={0.1} step={0.1} value={restockData.rollLengthFeet} onChange={e => setRestockData({...restockData, rollLengthFeet: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">New Buying Price (Optional)</label>
                <input type="number" value={restockData.buyingPrice} onChange={e => setRestockData({...restockData, buyingPrice: Number(e.target.value)})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Supplier</label>
                <select value={restockData.supplierId} onChange={e => setRestockData({...restockData, supplierId: e.target.value})} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none">
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setShowRestock(null)} className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200">Cancel</button>
                <button type="submit" className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800">Update Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdjust && (() => {
        const unitLabel = getBannerStockFeet(showAdjust) != null ? "feet" : getUnitLabel(showAdjust.unitType);
        const currentStock = Number(showAdjust.currentStock || 0);
        const delta = adjustData.direction === "IN" ? adjustData.quantity : -adjustData.quantity;
        const resultingStock = Number((currentStock + delta).toFixed(2));
        const wouldGoNegative = resultingStock < 0;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-7">
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Adjust Stock</h2>
              <p className="text-sm text-zinc-500 mb-1">{showAdjust.name}</p>
              <p className="text-xs text-zinc-400 mb-6">
                Current stock: <span className="font-bold text-zinc-700">{formatQuantity(currentStock)} {unitLabel}</span>
              </p>
              <form onSubmit={handleAdjust} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Action</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustData({ ...adjustData, direction: "OUT" })}
                      className={cn(
                        "rounded-xl border py-3 text-sm font-bold transition-all",
                        adjustData.direction === "OUT"
                          ? "border-red-300 bg-red-50 text-red-600"
                          : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
                      )}
                    >
                      Remove stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustData({ ...adjustData, direction: "IN" })}
                      className={cn(
                        "rounded-xl border py-3 text-sm font-bold transition-all",
                        adjustData.direction === "IN"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                          : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
                      )}
                    >
                      Add stock
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Quantity ({unitLabel})</label>
                  <input
                    type="number"
                    min={0}
                    step={getQuantityInputStep(showAdjust.unitType)}
                    required
                    value={adjustData.quantity}
                    onChange={(e) => setAdjustData({ ...adjustData, quantity: Number(e.target.value) })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                  <p className={cn("mt-2 text-xs", wouldGoNegative ? "text-red-600" : "text-zinc-500")}>
                    {wouldGoNegative
                      ? `Not enough stock — only ${formatQuantity(currentStock)} ${unitLabel} available.`
                      : `New stock will be ${formatQuantity(Math.max(0, resultingStock))} ${unitLabel}.`}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Used for banner job INV-1234, damaged, stock count correction"
                    value={adjustData.reason}
                    onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAdjust(null)} className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200">Cancel</button>
                  <button
                    type="submit"
                    disabled={wouldGoNegative || adjustData.quantity <= 0 || !adjustData.reason.trim()}
                    className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Save Adjustment
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setFilter("ALL")}
            className={cn(
              "rounded-xl px-4 py-3 text-sm font-bold transition-all",
              filter === "ALL" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            )}
          >
            All Items
          </button>
          <button 
            onClick={() => setFilter("LOW")}
            className={cn(
              "flex items-center rounded-xl px-4 py-3 text-sm font-bold transition-all",
              filter === "LOW" ? "bg-red-600 text-white" : "bg-white border border-zinc-200 text-red-600 hover:bg-red-50"
            )}
          >
            <AlertCircle size={16} className="mr-2" />
            Low Stock
          </button>
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {filteredProducts.map((product) => (
          <div key={product.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
                  <PackageCheck size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900">
                    {product.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{product.sku}</p>
                  {product.unitType === "ROLL" && (product.rollLengthFeet || product.rollWidthFeet) ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {product.rollWidthFeet ? `${product.rollWidthFeet.toFixed(2)}ft width` : "Width not set"}
                      {product.rollLengthFeet ? `, ${product.rollLengthFeet.toFixed(2)}ft length` : ""}
                      {getBannerStockFeet(product) != null ? ` • ${formatQuantity(getBannerStockFeet(product) || 0)}ft total stock` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
              <span className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
                product.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-600"
              )}>
                {product.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Buying Price</p>
                <p className="mt-1 font-bold text-zinc-900">
                  LKR {formatCurrency(product.buyingPrice)}{isPerUnitType(product.unitType) ? " / unit" : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Stock</p>
                {isBannerRollProduct(product) && getBannerStockFeet(product) != null ? (
                  <>
                    <p className={cn("mt-1 font-bold", product.currentStock <= product.minimumStockThreshold ? "text-red-600" : "text-zinc-900")}>
                      {formatQuantity(getBannerStockFeet(product) || 0)} FEET
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {formatQuantity(getBannerRollCount(product) || 0)} rolls
                    </p>
                  </>
                ) : (
                  <p className={cn("mt-1 font-bold", product.currentStock <= product.minimumStockThreshold ? "text-red-600" : "text-zinc-900")}>
                    {formatQuantity(product.currentStock)} {getUnitLabel(product.unitType).toUpperCase()}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Restock</p>
                <p className="mt-1 font-medium text-zinc-700">{product.lastRestockDate ? new Date(product.lastRestockDate).toLocaleDateString() : "Never"}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {canManageInventory && (
                <button
                  onClick={() => openEditProduct(product)}
                  className="w-full rounded-xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  Edit
                </button>
              )}
                <button
                  onClick={() => {
                    setShowRestock(product);
                    setRestockData(createRestockDataForProduct(product));
                  }}
                  className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800"
                >
                Restock
              </button>
              {canManageInventory && (
                <button
                  onClick={() => openAdjust(product)}
                  className="col-span-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
                >
                  <SlidersHorizontal size={16} />
                  Adjust Stock
                </button>
              )}
              {canManageInventory && (
                <button
                  onClick={() => setDeleteModal({ type: "PRODUCT", id: product.id, name: product.name })}
                  className="col-span-2 w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-bold text-red-600 hover:bg-red-100"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50">
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Product</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400">SKU</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Buying Price</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Stock</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Status</th>
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredProducts.map((product) => (
              <tr key={product.id} className="group hover:bg-zinc-50/50 transition-all">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-400">
                      <PackageCheck size={20} />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-bold text-zinc-900">
                        {product.name}
                      </p>
                      <p className="text-xs text-zinc-500">Last restock: {product.lastRestockDate ? new Date(product.lastRestockDate).toLocaleDateString() : 'Never'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-zinc-500">{product.sku}</td>
                <td className="px-6 py-4">
                  <p className="text-sm font-bold text-zinc-900">
                    LKR {formatCurrency(product.buyingPrice)}{isPerUnitType(product.unitType) ? " / unit" : ""}
                  </p>
                  {product.unitType === "ROLL" && (product.rollLengthFeet || product.rollWidthFeet) ? (
                    <p className="text-[10px] text-zinc-500">
                      {product.rollWidthFeet ? `${product.rollWidthFeet.toFixed(2)}ft width` : "Width not set"}
                      {product.rollLengthFeet ? ` • ${product.rollLengthFeet.toFixed(2)}ft length` : ""}
                      {getBannerStockFeet(product) != null ? ` • ${formatQuantity(getBannerStockFeet(product) || 0)}ft stock` : ""}
                    </p>
                  ) : null}
                </td>
                <td className="px-6 py-4">
                  {(() => {
                    const bannerFeet = getBannerStockFeet(product);
                    const bannerThresholdFeet = getBannerThresholdFeet(product);
                    const progressCurrent = bannerFeet ?? product.currentStock;
                    const progressThreshold = bannerThresholdFeet ?? product.minimumStockThreshold;
                    return (
                  <>
                  <div className="flex items-center">
                    <span className={cn(
                      "text-sm font-bold",
                      product.currentStock <= product.minimumStockThreshold ? "text-red-600" : "text-zinc-900"
                    )}>
                      {bannerFeet != null
                        ? `${formatQuantity(bannerFeet)} FEET`
                        : `${formatQuantity(product.currentStock)} ${getUnitLabel(product.unitType).toUpperCase()}`}
                    </span>
                    {product.currentStock <= product.minimumStockThreshold && (
                      <AlertCircle size={14} className="ml-2 text-red-500" />
                    )}
                  </div>
                  {bannerFeet != null ? (
                    <p className="mt-1 text-[10px] text-zinc-500">{formatQuantity(getBannerRollCount(product) || 0)} rolls</p>
                  ) : null}
                  <div className="mt-1 h-1.5 w-24 rounded-full bg-zinc-100">
                    <div 
                      className={cn(
                        "h-full rounded-full",
                        product.currentStock <= product.minimumStockThreshold ? "bg-red-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, (progressCurrent / (progressThreshold * 2)) * 100)}%` }}
                    ></div>
                  </div>
                  </>
                    );
                  })()}
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                    product.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-600"
                  )}>
                    {product.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2 opacity-0 transition-all group-hover:opacity-100">
                    {canManageInventory && (
                      <button
                        onClick={() => openEditProduct(product)}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setShowRestock(product);
                        setRestockData(createRestockDataForProduct(product));
                      }}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-orange-50 hover:text-orange-600"
                      title="Restock"
                    >
                      <Plus size={16} />
                    </button>
                    {canManageInventory && (
                      <button
                        onClick={() => openAdjust(product)}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        title="Adjust stock"
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                    )}
                    {canManageInventory && (
                      <button
                        onClick={() => setDeleteModal({ type: "PRODUCT", id: product.id, name: product.name })}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {deleteModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-zinc-900">Confirm Delete</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  {`Delete "${deleteModal.name}" from inventory?`}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3 text-xs text-red-700">
              This action cannot be undone.
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-200 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
