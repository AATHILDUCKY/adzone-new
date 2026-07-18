import { useEffect, useMemo, useState } from "react";
import { useShopProfile } from "../components/ShopProfileProvider";
import { apiFetch, cn } from "../lib/utils";
import { printOrderInvoice, type OrderInvoice } from "../lib/orders";
import {
  Search,
  ShoppingCart,
  Trash2,
  Pencil,
  CreditCard,
  Banknote,
  Wallet,
  Printer,
  ChevronRight,
  Minus,
  Plus,
  Ruler,
  Layers3,
  ShieldCheck,
  CircleAlert,
  FileText,
  PackagePlus,
  UserPlus,
  UserRound,
  Check,
} from "lucide-react";
import { toast } from "sonner";

type Product = {
  id: string;
  name: string;
  sku: string;
  buyingPrice: number;
  sellingPrice: number;
  currentStock: number;
  minimumStockThreshold: number;
  unitType: string;
  rollLengthFeet?: number | null;
  rollWidthFeet?: number | null;
  category?: {
    id: string;
    name: string;
  } | null;
  isService: boolean;
  materialId?: string | null;
  material?: {
    id: string;
    name: string;
    buyingPrice: number;
    unitType: string;
    currentStock: number;
    minimumStockThreshold?: number;
    rollLengthFeet?: number | null;
    rollWidthFeet?: number | null;
    category?: {
      id: string;
      name: string;
    } | null;
  } | null;
};

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type CartItem = {
  productId: string;
  name: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  width?: number;
  height?: number;
  designerCost: number;
  discount: number;
  wastage: number;
  wastageNote?: string;
  total: number;
  configSummary?: string;
  materialReduction?: number;
  materialName?: string;
  unitType: string;
  showServiceChargeInput?: boolean;
  showWastageInput?: boolean;
};

type ConfigState = {
  quantity: number;
  width: number;
  height: number;
  length: number;
  buyingUnitPrice: number;
  unitPrice: number;
  designerCost: number;
  lineDiscount: number;
  wastage: number;
  wastageNote: string;
  sizePreset: string;
};

type BannerPreset = {
  id: string;
  name: string;
  width: number;
  height: number;
};

type ProductCreateState = {
  id?: string;
  name: string;
  serviceOnly: boolean;
  materialId: string;
  unitType: string;
  sellingPrice: number;
};

function createInitialConfig(product?: Product | null): ConfigState {
  return {
    quantity: 1,
    width: 1,
    height: 1,
    length: 1,
    buyingUnitPrice: product ? product.material?.buyingPrice ?? product.buyingPrice ?? 0 : 0,
    unitPrice: product?.sellingPrice ?? 0,
    designerCost: 0,
    lineDiscount: 0,
    wastage: 0,
    wastageNote: "",
    sizePreset: "CUSTOM",
  };
}

function createInitialProductForm(product?: Product | null): ProductCreateState {
  return {
    id: product?.id,
    name: product?.name ?? "",
    serviceOnly: product ? Boolean(product.isService && !product.materialId) : false,
    materialId: product?.materialId ?? "",
    unitType: product?.unitType ?? "UNIT",
    sellingPrice: product?.sellingPrice ?? 0,
  };
}

function isFeetUnit(unitType: string) {
  return ["METER", "METERS", "METRE", "METRES", "FOOT", "FEET", "FEETS"].includes(unitType.trim().toUpperCase());
}

function getCartUnitLabel(unitType: string) {
  return isFeetUnit(unitType) ? "feet" : unitType.toLowerCase();
}

function getWastageUnitLabel(unitType: string) {
  return isFeetUnit(unitType) ? "feet" : unitType;
}

function isConfigurableProduct(product: Product) {
  return product.isService || ["SQFT", "ROLL"].includes(product.unitType) || isFeetUnit(product.unitType);
}

// Categories were removed; any ROLL material is treated as feet-based (banner-style).
function isBannerRollProduct(product: Product) {
  return product.unitType === "ROLL";
}

function isLengthInFeet(product: Product) {
  return isBannerRollProduct(product);
}

function getLengthUnitCode(product: Product) {
  if (isLengthInFeet(product)) {
    return "FEET";
  }

  return product.unitType;
}

function getLengthUnitLabel(product: Product) {
  if (isLengthInFeet(product)) {
    return "feet";
  }

  return isFeetUnit(product.unitType) ? "feet" : product.unitType.toLowerCase();
}

function getLengthUnitPriceLabel(product: Product) {
  if (isLengthInFeet(product)) {
    return "foot";
  }

  return isFeetUnit(product.unitType) ? "foot" : product.unitType.toLowerCase();
}

function getAvailableLengthFromRolls(product: Product) {
  if (product.unitType !== "ROLL") {
    return null;
  }
  if (isBannerRollProduct(product)) {
    return Number((product.currentStock || 0).toFixed(2));
  }
  if (!product.rollLengthFeet || product.rollLengthFeet <= 0) {
    return null;
  }
  return Number((product.currentStock * product.rollLengthFeet).toFixed(2));
}

function getAvailableRollCount(product: Product) {
  if (product.unitType !== "ROLL" || !product.rollLengthFeet || product.rollLengthFeet <= 0) {
    return null;
  }

  if (isBannerRollProduct(product)) {
    return Number((product.currentStock / product.rollLengthFeet).toFixed(2));
  }

  return Number(product.currentStock.toFixed(2));
}

function getRollStockBadge(product: Product) {
  if (product.unitType !== "ROLL") {
    return `Stock: ${formatQuantity(product.currentStock)}`;
  }

  if (isBannerRollProduct(product)) {
    return `${formatQuantity(product.currentStock)} ft`;
  }

  return `${formatQuantity(product.currentStock)} rolls`;
}

// Area-billed banners (sq-ft) no longer auto-reduce roll stock: a sq-ft area can't be
// converted to roll linear-feet at sale time, so roll stock is adjusted manually in Inventory.
// Every other product type still auto-reduces its linked material.
function isAreaBilled(product: Product) {
  return product.unitType === "SQFT";
}

function getBilledQuantity(product: Product, config: ConfigState) {
  if (product.unitType === "SQFT") {
    return config.width * config.height;
  }

  if (isFeetUnit(product.unitType) || isBannerRollProduct(product)) {
    return config.length;
  }

  return config.quantity;
}

function getMaterialReduction(product: Product, billedQuantity: number) {
  if (!product.materialId) {
    return billedQuantity;
  }

  return billedQuantity;
}

function getLineTotal(config: ConfigState, billedQuantity: number) {
  return billedQuantity * config.unitPrice + config.designerCost - config.lineDiscount;
}

function getLineCost(buyingPrice: number, quantity: number, wastage: number = 0, designerCost: number = 0) {
  return buyingPrice * (quantity + wastage) + designerCost;
}

function getLineProfit(total: number, buyingPrice: number, quantity: number, wastage: number = 0, designerCost: number = 0) {
  return total - getLineCost(buyingPrice, quantity, wastage, designerCost);
}

function getProfitMargin(total: number, profit: number) {
  if (total <= 0) {
    return 0;
  }

  return (profit / total) * 100;
}

function getCartItemTotal(item: Pick<CartItem, "quantity" | "sellingPrice" | "designerCost" | "discount">) {
  return item.quantity * item.sellingPrice + item.designerCost - item.discount;
}

function shouldShowServiceChargeInput(item: CartItem) {
  return item.showServiceChargeInput ?? item.designerCost > 0;
}

function shouldShowWastageInput(item: CartItem) {
  return item.showWastageInput ?? item.wastage > 0;
}

function getQuantityStep(unitType: string) {
  return unitType === "UNIT" ? 1 : 0.01;
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2);
}

function getDefaultProductUnitType(material?: Product | null) {
  if (!material) {
    return "UNIT";
  }

  // Legacy roll materials are banner stock; default banners to per-sqft billing (user can change).
  if (material.unitType === "ROLL") {
    return "SQFT";
  }

  return material.unitType;
}

export default function POS() {
  const { shopProfile } = useShopProfile();
  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paidAmount, setPaidAmount] = useState("0");
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerLookup, setCustomerLookup] = useState("");
  const [showCustomerRequiredModal, setShowCustomerRequiredModal] = useState(false);
  const [continueCheckoutAfterCustomer, setContinueCheckoutAfterCustomer] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [activeConfigItem, setActiveConfigItem] = useState<Product | null>(null);
  const [configData, setConfigData] = useState<ConfigState>(createInitialConfig());
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [createProductData, setCreateProductData] = useState<ProductCreateState>(createInitialProductForm());
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productPendingDelete, setProductPendingDelete] = useState<Product | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [isCheckoutConfirmOpen, setIsCheckoutConfirmOpen] = useState(false);
  const [printPromptOrder, setPrintPromptOrder] = useState<OrderInvoice | null>(null);
  const [bannerPresets, setBannerPresets] = useState<BannerPreset[]>([]);

  const loadPosData = async () => {
    const [productsData, customersData, presetsData] = await Promise.all([
      apiFetch("/products"),
      apiFetch("/customers"),
      apiFetch("/banner-presets"),
    ]);
    setProducts(productsData.filter((product: Product) => product.isService));
    setRawMaterials(productsData.filter((product: Product) => !product.isService));
    setCustomers(customersData);
    setBannerPresets(presetsData);
  };

  useEffect(() => {
    void loadPosData();
  }, []);

  const openConfig = (product: Product) => {
    setActiveConfigItem(product);
    setConfigData(createInitialConfig(product));
  };

  const selectedRawMaterial = rawMaterials.find((material) => material.id === createProductData.materialId) || null;

  const closeProductModal = () => {
    setShowCreateProduct(false);
    setEditingProductId(null);
    setCreateProductData(createInitialProductForm());
  };

  const openCreateProductModal = () => {
    setEditingProductId(null);
    setCreateProductData(createInitialProductForm());
    setShowCreateProduct(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProductId(product.id);
    setCreateProductData(createInitialProductForm(product));
    setShowCreateProduct(true);
  };

  const handleSaveProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!createProductData.serviceOnly && !selectedRawMaterial?.id) {
      toast.error("Select a raw material from inventory");
      return;
    }

    const linkedMaterial = createProductData.serviceOnly ? null : selectedRawMaterial;

    setIsCreatingProduct(true);
    try {
      await apiFetch(editingProductId ? `/products/${editingProductId}` : "/products", {
        method: editingProductId ? "PUT" : "POST",
        body: JSON.stringify({
          name: createProductData.name,
          unitType: createProductData.unitType,
          buyingPrice: 0,
          sellingPrice: createProductData.sellingPrice,
          currentStock: 0,
          minimumStockThreshold: 0,
          isService: true,
          materialId: linkedMaterial?.id ?? null,
          rollLengthFeet: !createProductData.serviceOnly && createProductData.unitType === "ROLL" ? linkedMaterial?.rollLengthFeet ?? null : null,
          rollWidthFeet: !createProductData.serviceOnly && createProductData.unitType === "ROLL" ? linkedMaterial?.rollWidthFeet ?? null : null,
        }),
      });
      toast.success(editingProductId ? "POS product updated successfully" : "POS product created successfully");
      closeProductModal();
      await loadPosData();
    } catch (error: any) {
      toast.error(error.message || `Failed to ${editingProductId ? "update" : "create"} product`);
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!productPendingDelete) {
      return;
    }

    setIsDeletingProduct(true);
    try {
      const response = await apiFetch(`/products/${productPendingDelete.id}`, {
        method: "DELETE",
      });
      toast.success(response.message || "POS product removed successfully");
      setProductPendingDelete(null);
      await loadPosData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete product");
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const addToCart = (product: Product) => {
    if (isConfigurableProduct(product)) {
      openConfig(product);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.productId === product.id && !item.configSummary);
    if (existingIndex >= 0) {
      const nextCart = [...cart];
      const existing = nextCart[existingIndex];
      const quantity = existing.quantity + 1;
      nextCart[existingIndex] = {
        ...existing,
        quantity,
        total: quantity * existing.sellingPrice,
      };
      setCart(nextCart);
      return;
    }

    setCart((currentCart) => [
      {
        productId: product.id,
        name: product.name,
        buyingPrice: product.material?.buyingPrice ?? product.buyingPrice,
        sellingPrice: product.sellingPrice,
        quantity: 1,
        designerCost: 0,
        discount: 0,
        wastage: 0,
        total: product.sellingPrice,
        unitType: product.unitType,
        showServiceChargeInput: false,
        showWastageInput: false,
      },
      ...currentCart,
    ]);
  };

  const updateCartQuantity = (index: number, nextQuantity: number) => {
    if (nextQuantity <= 0) {
      setCart((currentCart) => currentCart.filter((_, itemIndex) => itemIndex !== index));
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              quantity: nextQuantity,
              total: getCartItemTotal({
                ...item,
                quantity: nextQuantity,
              }),
            }
          : item,
      ),
    );
  };

  const updateCartPrices = (index: number, updates: { buyingPrice?: number; sellingPrice?: number }) => {
    setCart((currentCart) =>
      currentCart.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }
        const nextItem = {
          ...item,
          ...(updates.buyingPrice != null ? { buyingPrice: updates.buyingPrice } : {}),
          ...(updates.sellingPrice != null ? { sellingPrice: updates.sellingPrice } : {}),
        };
        return {
          ...nextItem,
          total: getCartItemTotal(nextItem),
        };
      }),
    );
  };

  const updateCartWastage = (index: number, wastage: number) => {
    setCart((currentCart) =>
      currentCart.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              wastage,
              showWastageInput: wastage > 0 ? true : item.showWastageInput,
            }
          : item,
      ),
    );
  };

  const updateCartWastageNote = (index: number, wastageNote: string) => {
    setCart((currentCart) =>
      currentCart.map((item, itemIndex) =>
        itemIndex === index ? { ...item, wastageNote } : item,
      ),
    );
  };

  const toggleServiceChargeInput = (index: number) => {
    setCart((currentCart) =>
      currentCart.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              showServiceChargeInput: !shouldShowServiceChargeInput(item),
            }
          : item,
      ),
    );
  };

  const updateCartServiceCharge = (index: number, designerCost: number) => {
    setCart((currentCart) =>
      currentCart.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const nextItem = {
          ...item,
          designerCost,
          showServiceChargeInput: designerCost > 0 ? true : item.showServiceChargeInput,
        };

        return {
          ...nextItem,
          total: getCartItemTotal(nextItem),
        };
      }),
    );
  };

  const toggleWastageInput = (index: number) => {
    setCart((currentCart) =>
      currentCart.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              showWastageInput: !shouldShowWastageInput(item),
            }
          : item,
      ),
    );
  };

  const confirmConfig = () => {
    if (!activeConfigItem) {
      return;
    }

    const billedQuantity = getBilledQuantity(activeConfigItem, configData);
    const lineTotal = getLineTotal(configData, billedQuantity);

    if (billedQuantity <= 0) {
      toast.error("Enter a valid size or quantity");
      return;
    }

    if (configData.unitPrice <= 0) {
      toast.error("Enter a valid selling price");
      return;
    }

    if (configData.buyingUnitPrice < 0) {
      toast.error("Buying price cannot be negative");
      return;
    }

    if (configData.wastage < 0) {
      toast.error("Wastage cannot be negative");
      return;
    }

    if (lineTotal < 0) {
      toast.error("Line total cannot be negative");
      return;
    }

    const configSummary =
      activeConfigItem.unitType === "SQFT"
        ? `${configData.width}ft x ${configData.height}ft (${formatQuantity(billedQuantity)} sqft)`
        : isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)
          ? `${formatQuantity(configData.length)} ${getLengthUnitLabel(activeConfigItem)}`
          : `${formatQuantity(configData.quantity)} ${activeConfigItem.unitType.toLowerCase()}`;

    setCart((currentCart) => [
      {
        productId: activeConfigItem.id,
        name: activeConfigItem.name,
        buyingPrice: configData.buyingUnitPrice,
        sellingPrice: configData.unitPrice,
        quantity: billedQuantity,
        width: activeConfigItem.unitType === "SQFT" ? configData.width : undefined,
        height: activeConfigItem.unitType === "SQFT" ? configData.height : undefined,
        designerCost: configData.designerCost,
        discount: configData.lineDiscount,
        wastage: configData.wastage,
        wastageNote: configData.wastageNote.trim() || undefined,
        total: lineTotal,
        configSummary,
        materialReduction:
          activeConfigItem.materialId && !isAreaBilled(activeConfigItem)
            ? getMaterialReduction(activeConfigItem, billedQuantity)
            : undefined,
        materialName: activeConfigItem.material?.name || undefined,
        unitType: getLengthUnitCode(activeConfigItem),
        showServiceChargeInput: configData.designerCost > 0,
        showWastageInput: configData.wastage > 0,
      },
      ...currentCart,
    ]);

    setActiveConfigItem(null);
  };

  const removeFromCart = (index: number) => {
    setCart((currentCart) => currentCart.filter((_, itemIndex) => itemIndex !== index));
  };

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku.toLowerCase().includes(search.toLowerCase()),
  );

  const subtotal = cart.reduce((totalValue, item) => totalValue + item.total, 0);
  const total = subtotal - discount;
  const parsedPaidAmount = Number(paidAmount || 0);
  const isUnderpaid = parsedPaidAmount < total;
  const pendingAmount = Math.max(0, Number((total - parsedPaidAmount).toFixed(2)));
  const changeAmount = Math.max(0, Number((parsedPaidAmount - total).toFixed(2)));
  const cartProfitBeforeDiscount = cart.reduce((sum, item) => {
    return sum + getLineProfit(item.total, item.buyingPrice, item.quantity, item.wastage, item.designerCost);
  }, 0);
  const cartEstimatedProfit = cartProfitBeforeDiscount - discount;
  const cartEstimatedMargin = getProfitMargin(total, cartEstimatedProfit);

  const previewQuantity = activeConfigItem ? getBilledQuantity(activeConfigItem, configData) : 0;
  const previewMaterialReduction =
    activeConfigItem && activeConfigItem.materialId && !isAreaBilled(activeConfigItem)
      ? getMaterialReduction(activeConfigItem, previewQuantity)
      : 0;
  const previewLineTotal = activeConfigItem ? getLineTotal(configData, previewQuantity) : 0;
  const previewMaterialCost = previewQuantity * configData.buyingUnitPrice;
  const previewWastageCost = configData.wastage * configData.buyingUnitPrice;
  const previewLineCost = getLineCost(configData.buyingUnitPrice, previewQuantity, configData.wastage, configData.designerCost);
  const previewLineProfit = getLineProfit(
    previewLineTotal,
    configData.buyingUnitPrice,
    previewQuantity,
    configData.wastage,
    configData.designerCost,
  );
  const previewLineMargin = getProfitMargin(previewLineTotal, previewLineProfit);
  const createProductEstimatedProfit = selectedRawMaterial
    ? createProductData.sellingPrice - selectedRawMaterial.buyingPrice
    : 0;
  const createProductEstimatedMargin = getProfitMargin(createProductData.sellingPrice, createProductEstimatedProfit);
  const filteredCustomers = useMemo(() => {
    const keyword = customerLookup.trim().toLowerCase();
    if (!keyword) {
      return customers;
    }

    return customers.filter((customer) => {
      const haystack = `${customer.name} ${customer.phone || ""} ${customer.email || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [customerLookup, customers]);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) || null;

  const openCustomerPanel = (continueToCheckout = false) => {
    setContinueCheckoutAfterCustomer(continueToCheckout);
    setCustomerLookup("");
    setShowCustomerRequiredModal(true);
  };

  useEffect(() => {
    if (cart.length === 0) {
      setPaidAmount("0");
      return;
    }

    setPaidAmount(total.toFixed(2));
  }, [cart.length, total]);

  const openCheckoutConfirmation = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    const hasInvalidPricing = cart.some((item) => item.sellingPrice < 0 || item.buyingPrice < 0 || item.wastage < 0 || item.total < 0);
    if (hasInvalidPricing) {
      toast.error("Buying/selling prices cannot be negative");
      return;
    }

    if (!Number.isFinite(parsedPaidAmount) || parsedPaidAmount < 0) {
      toast.error("Enter a valid paid amount");
      return;
    }

    if (parsedPaidAmount < total && !selectedCustomerId) {
      setContinueCheckoutAfterCustomer(true);
      setShowCustomerRequiredModal(true);
      return;
    }

    setIsCheckoutConfirmOpen(true);
  };

  const createCustomerFromCheckout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCustomerData.name.trim()) {
      toast.error("Customer name is required");
      return;
    }

    setCreatingCustomer(true);
    try {
      const createdCustomer = await apiFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newCustomerData.name.trim(),
          phone: newCustomerData.phone.trim() || null,
          email: newCustomerData.email.trim() || null,
          address: newCustomerData.address.trim() || null,
        }),
      });
      setCustomers((current) =>
        [...current, createdCustomer].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setSelectedCustomerId(createdCustomer.id);
      setNewCustomerData({
        name: "",
        phone: "",
        email: "",
        address: "",
      });
      setShowCustomerRequiredModal(false);
      if (continueCheckoutAfterCustomer) {
        setIsCheckoutConfirmOpen(true);
      }
      setContinueCheckoutAfterCustomer(false);
      toast.success("Customer added");
    } catch (error: any) {
      toast.error(error.message || "Failed to add customer");
    } finally {
      setCreatingCustomer(false);
    }
  };

  const completeCheckout = async () => {
    if (cart.length === 0) {
      setIsCheckoutConfirmOpen(false);
      return;
    }

    setLoading(true);
    try {
      const sale = await apiFetch("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            width: item.width,
            height: item.height,
            buyingPrice: item.buyingPrice,
            designerCost: item.designerCost,
            sellingPrice: item.sellingPrice,
            discount: item.discount,
            wastage: item.wastage,
          })),
          discount,
          paidAmount: parsedPaidAmount,
          paymentMethod,
          customerId: selectedCustomerId || null,
        }),
      });

      toast.success(isUnderpaid ? "Order saved as pending payment" : "Sale completed successfully");
      setPrintPromptOrder(sale);
      setCart([]);
      setDiscount(0);
      setSelectedCustomerId("");
      setIsCheckoutConfirmOpen(false);
      void loadPosData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const printCompletedInvoice = async () => {
    if (!printPromptOrder) {
      return;
    }

    try {
      await printOrderInvoice(printPromptOrder, shopProfile);
      if (shopProfile.printerName) toast.success(`Invoice sent to ${shopProfile.printerName}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to print invoice");
    } finally {
      setPrintPromptOrder(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 xl:h-[calc(100vh-132px)] xl:flex-row xl:overflow-hidden">
      <div className="flex flex-1 flex-col space-y-6 xl:overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
              <input
                type="text"
                placeholder="Search POS products by name or SKU..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-zinc-200 bg-white py-4 pl-12 pr-4 text-zinc-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10"
              />
            </div>
            <button
              type="button"
              onClick={openCreateProductModal}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-zinc-800"
            >
              <PackagePlus size={18} />
              Create Product
            </button>
          </div>

          <button
            type="button"
            onClick={() => openCustomerPanel(false)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-zinc-900 shadow-sm transition-all hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-500/10"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <UserRound size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Customer</span>
                <span className="block truncate text-sm font-semibold">{selectedCustomer?.name || "Walk-in Customer"}</span>
              </span>
            </span>
            <UserPlus size={18} className="shrink-0 text-orange-600" />
          </button>
        </div>

        <div className="scrollbar-hidden xl:flex-1 xl:overflow-y-auto xl:pr-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const linkedMaterial = product.material?.name;
              const sourceMaterial = product.material ? { ...product.material, isService: false, materialId: null } as Product : null;
              const availableLength = sourceMaterial ? getAvailableLengthFromRolls(sourceMaterial) : null;
              const availableRolls = sourceMaterial ? getAvailableRollCount(sourceMaterial) : null;
              return (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      addToCart(product);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="group flex h-full cursor-pointer flex-col items-start rounded-2xl border border-zinc-100 bg-white p-4 text-left shadow-sm transition-all hover:border-orange-500 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-orange-500/10"
                >
                  <div className="mb-4 flex w-full items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-50 text-zinc-400 transition-all group-hover:bg-orange-50 group-hover:text-orange-600">
                      <Printer size={24} />
                    </div>
                    <div className="flex items-center gap-2 opacity-100 transition-all sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditProductModal(product);
                        }}
                        className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                        aria-label={`Edit ${product.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setProductPendingDelete(product);
                        }}
                        className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-500 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${product.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="line-clamp-2 text-sm font-bold text-zinc-900">{product.name}</h4>
                    <p className="text-xs text-zinc-500">{product.sku}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                        {product.unitType}
                      </span>
                      {product.isService && (
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                          Print Service
                        </span>
                      )}
                    </div>
                    {linkedMaterial && (
                      <p className="text-xs text-zinc-500">
                        {isAreaBilled(product)
                          ? `Uses ${linkedMaterial} — adjust roll stock manually in Inventory`
                          : `Billing automatically reduces ${linkedMaterial}`}
                      </p>
                    )}
                    {product.unitType === "ROLL" && (product.rollLengthFeet || product.rollWidthFeet) ? (
                      <p className="text-xs text-zinc-500">
                        {product.rollWidthFeet ? `${formatQuantity(product.rollWidthFeet)}ft width` : "Width not set"}
                        {product.rollLengthFeet ? ` • ${formatQuantity(product.rollLengthFeet)}ft length` : ""}
                      </p>
                    ) : null}
                    {availableLength != null ? (
                      <p className="text-xs text-zinc-500">
                        Stock: {formatQuantity(availableLength)} feet{availableRolls != null ? ` (${formatQuantity(availableRolls)} rolls)` : ""}
                      </p>
                    ) : sourceMaterial ? (
                      <p className="text-xs text-zinc-500">
                        Stock: {formatQuantity(sourceMaterial.currentStock)} {sourceMaterial.unitType.toLowerCase()}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex w-full items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-orange-600">LKR {product.sellingPrice}</p>
                      <p className="text-[10px] text-zinc-400">Tap to bill</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold",
                        sourceMaterial && sourceMaterial.currentStock > sourceMaterial.minimumStockThreshold ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
                      )}
                    >
                      {sourceMaterial ? getRollStockBadge(sourceMaterial) : "No material"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-xl xl:w-[420px]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-5 sm:px-6">
          <div className="flex items-center">
            <ShoppingCart className="mr-2 text-orange-600" size={20} />
            <h3 className="text-lg font-bold text-zinc-900">Current Order</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCustomerPanel(false)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all",
                selectedCustomer
                  ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-orange-200 hover:text-orange-600",
              )}
              aria-label={selectedCustomer ? `Change customer: ${selectedCustomer.name}` : "Add customer details"}
              title={selectedCustomer ? `Customer: ${selectedCustomer.name}` : "Add customer"}
            >
              {selectedCustomer ? <UserRound size={17} /> : <UserPlus size={17} />}
            </button>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">{cart.length} Items</span>
          </div>
        </div>

        {selectedCustomer && (
          <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/60 px-5 py-2.5 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-orange-800">{selectedCustomer.name}</p>
              <p className="truncate text-[11px] text-orange-700/70">{selectedCustomer.phone || selectedCustomer.email || "Customer attached to order"}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCustomerId("")}
              className="ml-3 text-[11px] font-bold text-orange-700 hover:text-orange-900"
            >
              Remove
            </button>
          </div>
        )}

        <div className="min-h-[420px] flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 [scrollbar-gutter:stable] sm:px-6 xl:min-h-0">
          {cart.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-zinc-400">
              <ShoppingCart size={48} className="mb-4 opacity-20" />
              <p className="text-sm">Your cart is empty</p>
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={`${item.productId}-${index}`} className="rounded-[26px] border border-zinc-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h5 className="line-clamp-1 text-sm font-bold text-zinc-900">{item.name}</h5>
                    <p className="mt-1 text-xs text-zinc-500">
                      LKR {item.sellingPrice} / {getCartUnitLabel(item.unitType)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">Cost: LKR {item.buyingPrice}</p>
                    <p className={cn(
                      "mt-1 text-xs font-semibold",
                      getLineProfit(item.total, item.buyingPrice, item.quantity, item.wastage, item.designerCost) >= 0
                        ? "text-emerald-600"
                        : "text-red-600",
                    )}>
                      Profit: LKR {getLineProfit(item.total, item.buyingPrice, item.quantity, item.wastage, item.designerCost).toLocaleString()}
                      {" "}({getProfitMargin(item.total, getLineProfit(item.total, item.buyingPrice, item.quantity, item.wastage, item.designerCost)).toFixed(1)}%)
                    </p>
                    {item.configSummary && <p className="mt-1 text-xs text-zinc-500">{item.configSummary}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.designerCost > 0 && (
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                          Service charge: LKR {item.designerCost}
                        </span>
                      )}
                      {item.wastage > 0 && (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                          Wastage: {formatQuantity(item.wastage)} {getCartUnitLabel(item.unitType)}
                        </span>
                      )}
                      {item.wastageNote && (
                        <p className="w-full text-xs leading-relaxed text-zinc-500">
                          Note: {item.wastageNote}
                        </p>
                      )}
                    </div>
                    {item.materialReduction && item.materialName && (
                      <p className="mt-1 text-xs text-orange-600">
                        Reduces {item.materialName} by {formatQuantity(item.materialReduction)}
                      </p>
                    )}
                  </div>

                  <button onClick={() => removeFromCart(index)} className="text-zinc-300 transition-all hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-3">
                  {!item.configSummary ? (
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1">
                      <button
                        onClick={() => updateCartQuantity(index, item.quantity - 1)}
                        className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="min-w-12 text-center text-sm font-bold text-zinc-900">{formatQuantity(item.quantity)}</span>
                      <button
                        onClick={() => updateCartQuantity(index, item.quantity + 1)}
                        className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full bg-white px-3 py-2 text-xs font-bold text-zinc-600">
                      Qty {formatQuantity(item.quantity)}
                    </span>
                  )}

                  <span className="text-base font-bold text-zinc-900">LKR {item.total.toLocaleString()}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleServiceChargeInput(index)}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-semibold leading-tight text-orange-700 transition-all hover:border-orange-300 hover:bg-orange-100"
                  >
                    {shouldShowServiceChargeInput(item)
                      ? "Hide Service Charge"
                      : item.designerCost > 0
                        ? "Edit Service Charge"
                        : "Add Service Charge"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWastageInput(index)}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold leading-tight text-red-700 transition-all hover:border-red-300 hover:bg-red-100"
                  >
                    {shouldShowWastageInput(item)
                      ? `Hide Wastage (${getWastageUnitLabel(item.unitType)})`
                      : item.wastage > 0
                        ? `Edit Wastage (${getWastageUnitLabel(item.unitType)})`
                        : `Add Wastage (${getWastageUnitLabel(item.unitType)})`}
                  </button>
                </div>
                {shouldShowServiceChargeInput(item) && (
                  <div className="mt-2">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Service Charge
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={item.designerCost}
                      onChange={(event) => updateCartServiceCharge(index, Number(event.target.value))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                )}
                {shouldShowWastageInput(item) && (
                  <div className="mt-2">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Wastage ({getWastageUnitLabel(item.unitType)})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={getQuantityStep(item.unitType)}
                      value={item.wastage}
                      onChange={(event) => updateCartWastage(index, Number(event.target.value))}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
                    />
                    {isFeetUnit(item.unitType) && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                        Wastage is recorded in feet and added to material cost; it is not charged to the customer.
                      </p>
                    )}
                    <label className="mb-1 mt-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Wastage Note
                    </label>
                    <textarea
                      rows={2}
                      value={item.wastageNote ?? ""}
                      onChange={(event) => updateCartWastageNote(index, event.target.value)}
                      placeholder="Add a note about this wastage"
                      className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-100 bg-zinc-50/50 px-5 py-4 sm:px-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Subtotal</span>
              <span>LKR {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm text-zinc-500">
              <span>Discount</span>
              <input
                type="number"
                value={discount}
                onChange={(event) => setDiscount(Number(event.target.value))}
                className="w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-2 text-lg font-bold text-zinc-900">
              <span>Total</span>
              <span>LKR {total.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm text-zinc-500">
              <span>Paid Amount</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                className="w-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
            </div>
            {pendingAmount > 0 ? (
              <div className="flex justify-between text-sm font-semibold text-red-600">
                <span>Pending</span>
                <span>LKR {pendingAmount.toLocaleString()}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm font-semibold text-emerald-600">
                <span>Change</span>
                <span>LKR {changeAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-zinc-500">Estimated Profit</span>
              <span className={cn(cartEstimatedProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
                LKR {cartEstimatedProfit.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Estimated Margin</span>
              <span>{cartEstimatedMargin.toFixed(1)}%</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "CASH", icon: Banknote },
                { id: "CARD", icon: CreditCard },
                { id: "BANK", icon: Wallet },
              ].map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-xl border py-2.5 transition-all",
                      paymentMethod === method.id
                        ? "border-orange-600 bg-orange-600 text-white shadow-lg shadow-orange-200"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300",
                    )}
                  >
                    <Icon size={18} />
                    <span className="mt-1 text-[10px] font-bold">{method.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={openCheckoutConfirmation}
            disabled={loading || cart.length === 0}
            className="flex w-full items-center justify-center rounded-2xl bg-zinc-900 py-4 text-sm font-bold text-white shadow-xl shadow-zinc-200 transition-all hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Complete Order"}
            <ChevronRight size={20} className="ml-2" />
          </button>
        </div>
      </div>

      {activeConfigItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <h2 className="text-xl font-bold text-zinc-900">Configure Print Job</h2>
            <p className="mt-1 text-sm text-zinc-500">{activeConfigItem.name}</p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                {activeConfigItem.unitType === "SQFT" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Banner Size
                      </label>
                      <select
                        value={configData.sizePreset}
                        onChange={(event) => {
                          if (event.target.value === "CUSTOM") {
                            setConfigData((currentState) => ({
                              ...currentState,
                              sizePreset: "CUSTOM",
                            }));
                            return;
                          }

                          const preset = bannerPresets.find((item) => item.id === event.target.value);
                          if (!preset) {
                            return;
                          }
                          setConfigData((currentState) => ({
                            ...currentState,
                            sizePreset: preset.id,
                            width: preset.width,
                            height: preset.height,
                          }));
                        }}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                      >
                        <option value="CUSTOM">Custom Size</option>
                        {bannerPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name} ({formatQuantity(preset.width)}ft x {formatQuantity(preset.height)}ft)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Width (ft)</label>
                        <input
                          type="number"
                          value={configData.width}
                          onChange={(event) =>
                            setConfigData((currentState) => ({
                              ...currentState,
                              width: Number(event.target.value),
                              sizePreset: "CUSTOM",
                            }))
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Height (ft)</label>
                        <input
                          type="number"
                          value={configData.height}
                          onChange={(event) =>
                            setConfigData((currentState) => ({
                              ...currentState,
                              height: Number(event.target.value),
                              sizePreset: "CUSTOM",
                            }))
                          }
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {(isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)) && (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Length ({isLengthInFeet(activeConfigItem) ? "ft" : "feet"})
                    </label>
                    <input
                      type="number"
                      value={configData.length}
                      onChange={(event) =>
                        setConfigData((currentState) => ({
                          ...currentState,
                          length: Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                )}

                {activeConfigItem.unitType !== "SQFT" && !isFeetUnit(activeConfigItem.unitType) && !isBannerRollProduct(activeConfigItem) && (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Quantity</label>
                    <input
                      type="number"
                      value={configData.quantity}
                      onChange={(event) =>
                        setConfigData((currentState) => ({
                          ...currentState,
                          quantity: Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Service Charge</label>
                    <input
                      type="number"
                      value={configData.designerCost}
                      onChange={(event) =>
                        setConfigData((currentState) => ({
                          ...currentState,
                          designerCost: Number(event.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Line Discount</label>
                  <input
                    type="number"
                    value={configData.lineDiscount}
                    onChange={(event) =>
                      setConfigData((currentState) => ({
                        ...currentState,
                        lineDiscount: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Wastage ({isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)
                      ? (isLengthInFeet(activeConfigItem) ? "ft" : "feet")
                      : activeConfigItem.unitType})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={configData.wastage}
                    onChange={(event) =>
                      setConfigData((currentState) => ({
                        ...currentState,
                        wastage: Number(event.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                  {(isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)) && (
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                      Record wastage in feet. It is included in material cost, but not added to the customer’s billed length.
                    </p>
                  )}
                  {configData.wastage > 0 && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Wastage Note</label>
                      <textarea
                        rows={2}
                        value={configData.wastageNote}
                        onChange={(event) =>
                          setConfigData((currentState) => ({
                            ...currentState,
                            wastageNote: event.target.value,
                          }))
                        }
                        placeholder="Add a note about this wastage"
                        className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm placeholder:text-zinc-400 focus:border-orange-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-orange-50 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-orange-700">
                  <Layers3 size={18} />
                  Job Summary
                </div>

                <div className="mt-4 space-y-3 text-sm text-zinc-700">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Billed quantity</span>
                    <span className="font-bold">
                      {formatQuantity(previewQuantity)} {isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)
                        ? getLengthUnitCode(activeConfigItem)
                        : activeConfigItem.unitType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Service charge</span>
                    <span className="font-bold">LKR {configData.designerCost.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Material cost</span>
                    <span className="font-bold">LKR {previewMaterialCost.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Wastage cost</span>
                    <span className="font-bold">LKR {previewWastageCost.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Wastage</span>
                    <span className="font-bold">
                      {formatQuantity(configData.wastage)} {isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)
                        ? getLengthUnitCode(activeConfigItem)
                        : activeConfigItem.unitType}
                    </span>
                  </div>
                  {configData.wastage > 0 && (isFeetUnit(activeConfigItem.unitType) || isBannerRollProduct(activeConfigItem)) && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                      <span className="font-bold">Wastage note:</span> {formatQuantity(configData.wastage)} ft is included in the material cost (LKR {previewWastageCost.toLocaleString()}) and is not charged to the customer.
                    </div>
                  )}
                  {configData.wastageNote.trim() && (
                    <div className="rounded-2xl bg-white/70 px-3 py-2.5 text-xs leading-relaxed text-zinc-600">
                      <span className="font-bold text-zinc-700">Wastage note:</span> {configData.wastageNote}
                    </div>
                  )}
                  {activeConfigItem.material && (
                    <div className="rounded-2xl bg-white/70 p-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                        <Ruler size={14} />
                        Material Usage
                      </div>
                      {isAreaBilled(activeConfigItem) ? (
                        <p className="mt-2 text-sm text-zinc-700">
                          This banner uses <span className="font-bold">{activeConfigItem.material.name}</span>.
                          Roll stock is <span className="font-bold">not reduced automatically</span> — adjust it
                          manually in the Inventory screen after printing.
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-700">
                          {activeConfigItem.material.name} will reduce by{" "}
                          <span className="font-bold text-orange-700">{formatQuantity(previewMaterialReduction)}</span>{" "}
                          {isBannerRollProduct(activeConfigItem.material as Product)
                            ? getLengthUnitCode(activeConfigItem.material as Product)
                            : activeConfigItem.material.unitType}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-zinc-500">
                        Available stock: {formatQuantity(getAvailableLengthFromRolls(activeConfigItem.material as Product) ?? activeConfigItem.material.currentStock)} {isBannerRollProduct(activeConfigItem.material as Product)
                          ? getLengthUnitCode(activeConfigItem.material as Product)
                          : activeConfigItem.material.unitType}
                      </p>
                    </div>
                  )}
                  {activeConfigItem.unitType === "ROLL" && activeConfigItem.rollLengthFeet ? (
                    <div className="rounded-2xl bg-white/70 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Roll Length</p>
                      <p className="mt-2 text-sm text-zinc-700">
                        Each roll contains <span className="font-bold">{formatQuantity(activeConfigItem.rollLengthFeet)} feet</span>.
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Available: {formatQuantity(getAvailableLengthFromRolls(activeConfigItem) || 0)} feet ={" "}
                        <span className="font-bold">
                          {formatQuantity(getAvailableRollCount(activeConfigItem) || 0)} rolls
                        </span>
                      </p>
                    </div>
                  ) : null}
                  {activeConfigItem.unitType === "ROLL" && activeConfigItem.rollWidthFeet ? (
                    <div className="rounded-2xl bg-white/70 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Roll Width</p>
                      <p className="mt-2 text-sm text-zinc-700">
                        This roll is <span className="font-bold">{formatQuantity(activeConfigItem.rollWidthFeet)} feet</span> wide.
                      </p>
                    </div>
                  ) : null}
                  <div className="border-t border-orange-100 pt-3">
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold text-zinc-700">
                      <span>Estimated cost</span>
                      <span>LKR {previewLineCost.toLocaleString()}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                      <span className="text-zinc-700">Estimated profit</span>
                      <span className={cn(previewLineProfit >= 0 ? "text-emerald-700" : "text-red-600")}>
                        LKR {previewLineProfit.toLocaleString()}
                      </span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold text-zinc-700">
                      <span>Estimated margin</span>
                      <span>{previewLineMargin.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-base font-bold text-orange-800">
                      <span>Estimated total</span>
                      <span>LKR {previewLineTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setActiveConfigItem(null)}
                className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
              >
                Cancel
              </button>
            <button onClick={confirmConfig} className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800">
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateProduct && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">{editingProductId ? "Edit POS Product" : "Create POS Product"}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Link one raw material, or create a service-only product (e.g. graphics design) that doesn't touch inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={closeProductModal}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Product Name</label>
                <input
                  required
                  value={createProductData.name}
                  onChange={(event) => setCreateProductData((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  placeholder="PVC ID Card Printing"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">Product Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateProductData((current) => ({ ...current, serviceOnly: false }))}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                      !createProductData.serviceOnly
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300",
                    )}
                  >
                    Material-linked
                    <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">Uses a raw material from inventory</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCreateProductData((current) => ({
                        ...current,
                        serviceOnly: true,
                        materialId: "",
                        unitType: "UNIT",
                      }))
                    }
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all",
                      createProductData.serviceOnly
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300",
                    )}
                  >
                    Service only
                    <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">e.g. graphics design — no inventory</span>
                  </button>
                </div>
              </div>

              {!createProductData.serviceOnly && (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Raw Material</label>
                  <select
                    required
                    value={createProductData.materialId}
                    onChange={(event) => {
                      const material = rawMaterials.find((item) => item.id === event.target.value) || null;
                      setCreateProductData((current) => ({
                        ...current,
                        materialId: event.target.value,
                        unitType: getDefaultProductUnitType(material),
                      }));
                    }}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  >
                    <option value="">Select raw material from inventory</option>
                    {rawMaterials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!createProductData.serviceOnly && (
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Billing Unit Type</label>
                  <select
                    value={createProductData.unitType}
                    onChange={(event) => setCreateProductData((current) => ({ ...current, unitType: event.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                  >
                    <option value="UNIT">Per Unit</option>
                    <option value="SQFT">Per Sqft</option>
                    <option value="FEET">Per Feet</option>
                  </select>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Base Selling Price (LKR)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={createProductData.sellingPrice}
                  onChange={(event) => setCreateProductData((current) => ({ ...current, sellingPrice: Number(event.target.value) }))}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
                />
                <p className="mt-2 text-xs text-zinc-500">
                  {createProductData.serviceOnly
                    ? "Service-only product. No raw material is reserved or reduced — you can still add charges during billing."
                    : "Raw material cost stays in inventory. You can add service, ink, design, or other charges during billing."}
                </p>
              </div>

              {selectedRawMaterial && (
                <div className="md:col-span-2 rounded-3xl border border-orange-100 bg-orange-50/60 p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-orange-700">
                    <Layers3 size={18} />
                    Linked Raw Material
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">
                    {createProductData.unitType === "SQFT" ? (
                      <>
                        This banner uses <span className="font-bold">{selectedRawMaterial.name}</span>. Roll stock is
                        managed manually in the Inventory screen (not reduced automatically on each sale).
                      </>
                    ) : (
                      <>
                        This POS product will reduce <span className="font-bold">{selectedRawMaterial.name}</span> from inventory automatically.
                      </>
                    )}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Material Cost</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">LKR {selectedRawMaterial.buyingPrice.toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Stock</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">{getRollStockBadge(selectedRawMaterial)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Usage</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">
                        {createProductData.unitType === "SQFT"
                          ? "Roll stock adjusted manually in Inventory"
                          : "1 billed unit reduces 1 linked material unit"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Base Selling</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">LKR {createProductData.sellingPrice.toLocaleString()}</p>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Est. Profit / Unit</p>
                      <p className={cn("mt-1 text-sm font-semibold", createProductEstimatedProfit >= 0 ? "text-emerald-700" : "text-red-600")}>
                        LKR {createProductEstimatedProfit.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Est. Margin</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">{createProductEstimatedMargin.toFixed(1)}%</p>
                    </div>
                  </div>
                  {selectedRawMaterial.unitType === "ROLL" && (
                    <p className="mt-4 text-sm text-zinc-600">
                      Roll setup: {selectedRawMaterial.rollWidthFeet ? `${formatQuantity(selectedRawMaterial.rollWidthFeet)}ft width` : "width not set"}
                      {selectedRawMaterial.rollLengthFeet ? ` • ${formatQuantity(selectedRawMaterial.rollLengthFeet)}ft full roll length` : ""}
                    </p>
                  )}
                </div>
              )}

              <div className="md:col-span-2 flex flex-col gap-3 pt-2 sm:flex-row">
                <button
                  type="button"
                  onClick={closeProductModal}
                  className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProduct}
                  className="flex-1 rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {isCreatingProduct ? (editingProductId ? "Saving..." : "Creating...") : (editingProductId ? "Save Changes" : "Create Product")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {productPendingDelete && (
        <div className="fixed inset-0 z-[108] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                <Trash2 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Delete POS Product</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Remove <span className="font-semibold text-zinc-800">{productPendingDelete.name}</span> from POS products. Previous sales will stay preserved if this product already has history.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              Linked raw material: <span className="font-semibold text-zinc-900">{productPendingDelete.material?.name || "Not linked"}</span>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setProductPendingDelete(null)}
                disabled={isDeletingProduct}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteProduct()}
                disabled={isDeletingProduct}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isDeletingProduct ? "Deleting..." : "Delete Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCheckoutConfirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-orange-50 p-3 text-orange-700">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">{isUnderpaid ? "Save Pending Order" : "Confirm Order"}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {isUnderpaid
                    ? "This order will be saved as pending until customer finishes payment."
                    : "Please confirm before completing this sale."}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-600">
                <span>Items</span>
                <span className="font-semibold text-zinc-900">{cart.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-600">
                <span>Payment Method</span>
                <span className="font-semibold text-zinc-900">{paymentMethod}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-600">
                <span>Paid</span>
                <span className="font-semibold text-zinc-900">LKR {parsedPaidAmount.toLocaleString()}</span>
              </div>
              {pendingAmount > 0 ? (
                <div className="flex items-center justify-between text-sm text-red-600">
                  <span>Pending</span>
                  <span className="font-semibold">LKR {pendingAmount.toLocaleString()}</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-sm text-emerald-600">
                  <span>Change</span>
                  <span className="font-semibold">LKR {changeAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-base font-bold text-zinc-900">
                <span>Total</span>
                <span>LKR {total.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setIsCheckoutConfirmOpen(false)}
                disabled={loading}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void completeCheckout()}
                disabled={loading}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading ? "Saving..." : isUnderpaid ? "Save Pending Order" : "Confirm & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomerRequiredModal && (
        <div className="fixed inset-0 z-[112] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-orange-50 p-3 text-orange-700"><UserPlus size={21} /></div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">{continueCheckoutAfterCustomer ? "Customer Required For Unpaid Order" : "Add Customer To Order"}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {continueCheckoutAfterCustomer
                    ? "Select an existing customer or quickly create one before saving the pending payment."
                    : "Search your customer list or create a new profile without leaving the cart."}
                </p>
              </div>
            </div>

            {continueCheckoutAfterCustomer && <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <div className="flex items-center justify-between text-zinc-600">
                <span>Total Bill</span>
                <span className="font-semibold text-zinc-900">LKR {total.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-zinc-600">
                <span>Paid</span>
                <span className="font-semibold text-zinc-900">LKR {parsedPaidAmount.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-red-600">
                <span>Pending</span>
                <span className="font-semibold">LKR {pendingAmount.toLocaleString()}</span>
              </div>
            </div>}

            <div className="mt-5">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-400">Search Existing Customer</label>
              <input
                type="text"
                value={customerLookup}
                onChange={(event) => setCustomerLookup(event.target.value)}
                placeholder="Search by name, phone, or email..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-zinc-50 p-2 [scrollbar-gutter:stable]">
                {filteredCustomers.length ? filteredCustomers.slice(0, 20).map((customer) => {
                  const isSelected = customer.id === selectedCustomerId;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                        isSelected ? "border-orange-300 bg-orange-50" : "border-transparent bg-white hover:border-zinc-200",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-zinc-900">{customer.name}</span>
                        <span className="block truncate text-xs text-zinc-500">{customer.phone || customer.email || "No contact details"}</span>
                      </span>
                      {isSelected && <span className="rounded-full bg-orange-600 p-1 text-white"><Check size={12} /></span>}
                    </button>
                  );
                }) : (
                  <p className="px-3 py-6 text-center text-sm text-zinc-500">No matching customers found.</p>
                )}
              </div>
            </div>

            <form onSubmit={createCustomerFromCheckout} className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Or Add New Customer</p>
              </div>
              <input
                required
                value={newCustomerData.name}
                onChange={(event) => setNewCustomerData((current) => ({ ...current, name: event.target.value }))}
                placeholder="Customer name"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <input
                value={newCustomerData.phone}
                onChange={(event) => setNewCustomerData((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Phone (optional)"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <input
                value={newCustomerData.email}
                onChange={(event) => setNewCustomerData((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email (optional)"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <input
                value={newCustomerData.address}
                onChange={(event) => setNewCustomerData((current) => ({ ...current, address: event.target.value }))}
                placeholder="Address (optional)"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-orange-500 focus:bg-white focus:outline-none"
              />
              <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerRequiredModal(false);
                    setContinueCheckoutAfterCustomer(false);
                  }}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedCustomerId) {
                      toast.error("Select a customer or add a new customer");
                      return;
                    }
                    setShowCustomerRequiredModal(false);
                    if (continueCheckoutAfterCustomer) {
                      setIsCheckoutConfirmOpen(true);
                    }
                    setContinueCheckoutAfterCustomer(false);
                  }}
                  className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  {continueCheckoutAfterCustomer ? "Use & Continue" : "Use Customer"}
                </button>
                <button
                  type="submit"
                  disabled={creatingCustomer}
                  className="flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {creatingCustomer ? "Saving..." : "Add New Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {printPromptOrder && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-zinc-900/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <FileText size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">
                  {printPromptOrder.total > printPromptOrder.paidAmount ? "Pending Order Saved" : "Sale Completed"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">Do you want to print the B5 invoice now?</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center justify-between text-sm text-zinc-600">
                <span>Invoice</span>
                <span className="font-semibold text-zinc-900">{printPromptOrder.invoiceNumber}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-600">
                <span>Customer</span>
                <span className="font-semibold text-zinc-900">{printPromptOrder.customer?.name || "Walk-in Customer"}</span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-base font-bold text-zinc-900">
                <span>Total</span>
                <span>{printPromptOrder.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {printPromptOrder.total > printPromptOrder.paidAmount ? (
                <div className="flex items-center justify-between text-sm font-semibold text-red-600">
                  <span>Pending</span>
                  <span>
                    {(printPromptOrder.total - printPromptOrder.paidAmount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setPrintPromptOrder(null)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={printCompletedInvoice}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Print Invoice
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              A saved printer prints directly on B5 paper. Without one, your browser print dialog will open.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
