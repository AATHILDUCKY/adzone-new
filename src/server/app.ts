import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { authenticate, createAuthToken, requireRoles, type AuthenticatedRequest } from "./auth";
import { ensureAdminUser } from "./bootstrap";
import { config } from "./config";
import { getNotificationMailStatus, sendInventoryReductionNotification } from "./mailer";
import { prisma } from "./prisma";
import {
  ApiError,
  asArray,
  asBoolean,
  asEmail,
  asNumber,
  asString,
  ensurePaymentMethod,
  ensureRole,
  ensureStatus,
} from "./validation";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
};

const productInclude = {
  category: {
    select: { id: true, name: true },
  },
  supplier: {
    select: { id: true, name: true, contactPerson: true },
  },
  material: {
    select: {
      id: true,
      name: true,
      sku: true,
      buyingPrice: true,
      unitType: true,
      currentStock: true,
      minimumStockThreshold: true,
      category: {
        select: { id: true, name: true },
      },
    },
  },
};

const orderListSelect = {
  id: true,
  invoiceNumber: true,
  subtotal: true,
  discount: true,
  total: true,
  paidAmount: true,
  balance: true,
  paymentMethod: true,
  createdAt: true,
  customer: {
    select: { id: true, name: true },
  },
  cashier: {
    select: { id: true, name: true },
  },
  _count: {
    select: { items: true },
  },
} satisfies Prisma.SaleSelect;

const orderDetailInclude = {
  customer: {
    select: { id: true, name: true, phone: true, email: true, address: true },
  },
  cashier: {
    select: { id: true, name: true, email: true },
  },
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, unitType: true },
      },
    },
  },
};

type NotificationRecipientRecord = {
  id: string;
  name: string;
  email: string;
  isEnabled: boolean | number;
  notificationType: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type AppNotificationItem = {
  id: string;
  type: "LOW_STOCK";
  status: string;
  title: string;
  message: string;
  createdAt: Date;
  productId: string;
  productName: string;
  currentStock: number;
  thresholdValue: number;
};

type AuditLogListItem = {
  id: string;
  action: string;
  module: string;
  details: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
};

type ProductRollMetaRow = {
  id: string;
  rollLengthFeet: number | null;
  rollWidthFeet: number | null;
};

type BannerPresetRow = {
  id: string;
  name: string;
  width: number;
  height: number;
  isActive: boolean | number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SupplierSupplyRecordRow = {
  id: string;
  supplierId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  suppliedAt: Date | string;
  createdAt: Date | string;
};

type SupplierSupplyItemRow = {
  id: string;
  supplierId: string;
  name: string;
  createdAt: Date | string;
};

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const FEET_PER_METER = 3.28084;
const execFileAsync = promisify(execFile);
const SHOP_PROFILE_META_KEYS = {
  shopName: "shop-profile.shop-name",
  tagline: "shop-profile.tagline",
  phone: "shop-profile.phone",
  email: "shop-profile.email",
  address: "shop-profile.address",
  invoiceFooter: "shop-profile.invoice-footer",
  logoUrl: "shop-profile.logo-url",
  printerName: "shop-profile.printer-name",
} as const;

type ShopProfile = {
  shopName: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  invoiceFooter?: string;
  logoUrl?: string;
  printerName?: string;
};

const defaultShopProfile: ShopProfile = {
  shopName: "Adzone",
  tagline: "Printing Industries",
  phone: "0743838418",
  email: "adzone@gmail.com",
  address: "leththif GS street, Kinniya",
  invoiceFooter: "Thank you for your business.",
};

function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseTimezoneOffsetMinutes(query: Request["query"]) {
  if (typeof query.tzOffsetMinutes !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(query.tzOffsetMinutes, 10);
  if (Number.isNaN(parsed) || parsed < -840 || parsed > 840) {
    throw new ApiError(400, "Timezone offset is invalid");
  }

  return parsed;
}

function parseDateQueryValue(value: string, tzOffsetMinutes: number, endOfDay = false): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split("-").map((segment) => Number.parseInt(segment, 10));
    const [year, month, day] = parts;
    const validationDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    if (
      Number.isNaN(validationDate.getTime())
      || validationDate.getUTCFullYear() !== year
      || validationDate.getUTCMonth() + 1 !== month
      || validationDate.getUTCDate() !== day
    ) {
      throw new ApiError(400, `${endOfDay ? "End" : "Start"} date is invalid`);
    }

    const utcTimestamp = Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ) + tzOffsetMinutes * 60_000;

    return new Date(utcTimestamp);
  }

  return new Date(value);
}

function getDateRange(query: Request["query"]) {
  const tzOffsetMinutes = parseTimezoneOffsetMinutes(query);
  const start = typeof query.start === "string" ? parseDateQueryValue(query.start, tzOffsetMinutes) : undefined;
  const end = typeof query.end === "string" ? parseDateQueryValue(query.end, tzOffsetMinutes, true) : undefined;

  if (start && Number.isNaN(start.getTime())) {
    throw new ApiError(400, "Start date is invalid");
  }

  if (end && Number.isNaN(end.getTime())) {
    throw new ApiError(400, "End date is invalid");
  }

  return { start, end };
}

function buildDateRangeFilter(start?: Date, end?: Date) {
  if (!start && !end) {
    return undefined;
  }

  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: end } : {}),
  };
}

function getLimit(query: Request["query"], fallback = 50, cap = 250) {
  const rawLimit = typeof query.limit === "string" ? Number.parseInt(query.limit, 10) : fallback;
  if (Number.isNaN(rawLimit) || rawLimit <= 0) {
    return fallback;
  }
  return Math.min(rawLimit, cap);
}

function getPage(query: Request["query"]) {
  const rawPage = typeof query.page === "string" ? Number.parseInt(query.page, 10) : 1;
  if (Number.isNaN(rawPage) || rawPage <= 0) {
    return 1;
  }

  return rawPage;
}

function serializePublicUser(user: { id: string; name: string; email: string; role: string; status: string; createdAt?: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
  };
}

function resolveOrderPaymentFilter(value: unknown) {
  if (typeof value !== "string" || !value || value === "ALL") {
    return undefined;
  }

  return ensurePaymentMethod(value);
}

function resolveOrderPaymentStatusFilter(value: unknown) {
  if (typeof value !== "string" || !value || value === "ALL") {
    return undefined;
  }

  if (value === "PAID") {
    return { gte: 0 } as const;
  }

  if (value === "UNPAID") {
    return { lt: 0 } as const;
  }

  throw new ApiError(400, "Payment status filter must be ALL, PAID, or UNPAID");
}

function resolveOrderCustomerFilter(value: unknown) {
  if (typeof value !== "string" || !value || value === "ALL") {
    return undefined;
  }

  if (value === "REGISTERED") {
    return { not: null } as const;
  }

  if (value === "WALK_IN") {
    return null;
  }

  throw new ApiError(400, "Customer filter must be ALL, REGISTERED, or WALK_IN");
}

async function recordAuditLog(tx: any, userId: string | undefined, module: string, action: string, details?: string) {
  await tx.auditLog.create({
    data: {
      userId,
      module,
      action,
      details,
    },
  });
}

function calculateItemTotal(quantity: number, sellingPrice: number, designerCost: number, discount: number) {
  const total = sellingPrice * quantity + designerCost - discount;
  if (total < 0) {
    throw new ApiError(400, "Item total cannot be negative");
  }
  return Number(total.toFixed(2));
}

function calculateItemCost(
  quantity: number,
  buyingPrice: number,
  wastage: number = 0,
  designerCost: number = 0,
) {
  return Number((buyingPrice * (quantity + wastage) + designerCost).toFixed(2));
}

function calculateItemProfit(
  total: number,
  quantity: number,
  buyingPrice: number,
  wastage: number = 0,
  designerCost: number = 0,
) {
  return Number((total - calculateItemCost(quantity, buyingPrice, wastage, designerCost)).toFixed(2));
}

function calculateSaleCost(
  items: Array<{ quantity: number; buyingPrice: number; wastage?: number | null; designerCost?: number | null }>,
) {
  return Number(
    items
      .reduce((sum, item) => {
        return sum + calculateItemCost(
          item.quantity,
          item.buyingPrice,
          item.wastage ?? 0,
          item.designerCost ?? 0,
        );
      }, 0)
      .toFixed(2),
  );
}

function calculateSaleProfit(
  total: number,
  items: Array<{ quantity: number; buyingPrice: number; wastage?: number | null; designerCost?: number | null }>,
) {
  return Number((total - calculateSaleCost(items)).toFixed(2));
}

function normalizeSkuFragment(value: string) {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);

  return cleaned || "ITEM";
}

async function generateUniqueProductSku(name: string, client: any = prisma) {
  const base = normalizeSkuFragment(name);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${Date.now().toString().slice(-6)}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const existing = await client.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new ApiError(500, "Unable to generate a unique SKU right now");
}

// Categories were removed from the app; any ROLL material is treated as feet-based (banner-style).
function isBannerRollProduct(product: { unitType: string }) {
  return product.unitType === "ROLL";
}

function optionalEmail(value: unknown, field: string) {
  if (value == null || value === "") {
    return undefined;
  }

  return asEmail(value, field);
}

function validateShopLogoUrl(value: unknown) {
  const logoUrl = asString(value, { field: "Shop logo", max: 700_000, optional: true });
  if (!logoUrl) {
    return undefined;
  }

  const allowedPrefixes = ["data:image/", "http://", "https://", "/"];
  if (!allowedPrefixes.some((prefix) => logoUrl.startsWith(prefix))) {
    throw new ApiError(400, "Shop logo must be an image upload, site path, or http/https URL");
  }

  return logoUrl;
}

function sanitizeShopProfileInput(body: any): ShopProfile {
  return {
    shopName: asString(body?.shopName, { field: "Shop name", min: 2, max: 80 })!,
    tagline: asString(body?.tagline, { field: "Tagline", max: 140, optional: true }),
    phone: asString(body?.phone, { field: "Phone", max: 40, optional: true }),
    email: optionalEmail(body?.email, "Shop email"),
    address: asString(body?.address, { field: "Address", max: 240, optional: true }),
    invoiceFooter: asString(body?.invoiceFooter, { field: "Invoice footer", max: 240, optional: true }),
    logoUrl: validateShopLogoUrl(body?.logoUrl),
    printerName: asString(body?.printerName, { field: "Printer", max: 180, optional: true }),
  };
}

async function getShopProfile(client: typeof prisma = prisma): Promise<ShopProfile> {
  const rows = await client.appMeta.findMany({
    where: {
      key: {
        in: Object.values(SHOP_PROFILE_META_KEYS),
      },
    },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    shopName: byKey.get(SHOP_PROFILE_META_KEYS.shopName) || defaultShopProfile.shopName,
    tagline: byKey.get(SHOP_PROFILE_META_KEYS.tagline) || defaultShopProfile.tagline,
    phone: byKey.get(SHOP_PROFILE_META_KEYS.phone) || defaultShopProfile.phone,
    email: byKey.get(SHOP_PROFILE_META_KEYS.email) || defaultShopProfile.email,
    address: byKey.get(SHOP_PROFILE_META_KEYS.address) || defaultShopProfile.address,
    invoiceFooter: byKey.get(SHOP_PROFILE_META_KEYS.invoiceFooter) || defaultShopProfile.invoiceFooter,
    logoUrl: byKey.get(SHOP_PROFILE_META_KEYS.logoUrl) || undefined,
    printerName: byKey.get(SHOP_PROFILE_META_KEYS.printerName) || undefined,
  };
}

async function getSystemPrinters() {
  try {
    const { stdout } = await execFileAsync("lpstat", ["-p"], { timeout: 5_000 });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^printer\s+(\S+)/)?.[1])
      .filter((name): name is string => Boolean(name));
  } catch (error: any) {
    if (
      error?.code === 1 &&
      (!String(error?.stdout || "").trim() || String(error?.stderr || "").includes("Scheduler is not running"))
    ) return [];
    throw new ApiError(503, "Could not read printers from the operating system");
  }
}

async function printB5Invoice(printerName: string, markup: string) {
  const printers = await getSystemPrinters();
  if (!printers.includes(printerName)) throw new ApiError(400, "The saved printer is not available");

  const workingDirectory = await mkdtemp(join(tmpdir(), "adzone-invoice-"));
  const htmlPath = join(workingDirectory, "invoice.html");
  const pdfPath = join(workingDirectory, "invoice.pdf");

  try {
    await writeFile(htmlPath, markup, "utf8");
    await execFileAsync("google-chrome", [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ], { timeout: 30_000 });
    await execFileAsync("lp", ["-d", printerName, "-o", "media=iso_b5_176x250mm", pdfPath], { timeout: 15_000 });
  } catch {
    throw new ApiError(503, "The invoice could not be sent to the printer");
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

async function saveShopProfile(profile: ShopProfile, client: typeof prisma = prisma) {
  await client.$transaction(async (tx) => {
    for (const [field, key] of Object.entries(SHOP_PROFILE_META_KEYS)) {
      await tx.appMeta.upsert({
        where: { key },
        update: {
          value: profile[field as keyof ShopProfile] ?? "",
        },
        create: {
          key,
          value: profile[field as keyof ShopProfile] ?? "",
        },
      });
    }
  });
}

function metersToFeet(value: number) {
  return Number((value * FEET_PER_METER).toFixed(4));
}

// METER was the old internal name for the length unit. Length stock has always
// been entered and calculated as feet, so normalize legacy clients/data here.
function normalizeUnitType(value: string) {
  return value === "METER" ? "FEET" : value;
}

async function ensureLengthUnitsStoredAsFeet() {
  await prisma.product.updateMany({
    where: { unitType: "METER" },
    data: { unitType: "FEET" },
  });
}

function resolveBannerRollFeet(rollCount: number | undefined, rollLengthFeet: number | null | undefined, fallbackStock: number) {
  if (rollCount && rollCount > 0 && rollLengthFeet && rollLengthFeet > 0) {
    return Number((rollCount * rollLengthFeet).toFixed(4));
  }

  return Number(fallbackStock.toFixed(4));
}

function getRollUsageBreakdown(feet: number, rollLengthFeet: number) {
  const normalizedFeet = Number(feet.toFixed(4));
  const fullRolls = Math.floor(normalizedFeet / rollLengthFeet);
  const partialFeet = Number((normalizedFeet - fullRolls * rollLengthFeet).toFixed(4));
  const rollsUsed = Number((normalizedFeet / rollLengthFeet).toFixed(4));
  const remainingFeetInCurrentRoll = partialFeet > 0 ? Number((rollLengthFeet - partialFeet).toFixed(4)) : 0;

  return {
    fullRolls,
    partialFeet,
    rollsUsed,
    remainingFeetInCurrentRoll,
  };
}

function resolveStockReductionQuantity(
  product: {
    name: string;
    unitType: string;
    isService: boolean;
    materialId?: string | null;
    rollLengthFeet?: number | null;
    category?: { name?: string | null } | null;
  },
  item: { quantity: number; width?: number; height?: number },
) {
  // Inventory must be reduced from real material stock for print services.
  if (product.isService && !product.materialId) {
    throw new ApiError(
      400,
      `Product ${product.name} is a service and must be linked to a material item before it can be billed.`,
    );
  }

  if (product.unitType === "SQFT") {
    if (item.width && item.height) {
      return Number((item.width * item.height).toFixed(2));
    }
    return Number(item.quantity.toFixed(2));
  }

  if (product.unitType === "ROLL") {
    // Banner rolls are billed and stocked in feet; other rolls are billed as roll counts.
    return Number(item.quantity.toFixed(4));
  }

  return Number(item.quantity.toFixed(2));
}

function resolveWastageReductionQuantity(
  product: { name: string; unitType: string; rollLengthFeet?: number | null; category?: { name?: string | null } | null },
  wastage: number,
) {
  if (wastage <= 0) {
    return 0;
  }

  if (product.unitType === "ROLL") {
    return Number(wastage.toFixed(4));
  }

  return Number(wastage.toFixed(2));
}

function getRestockReason(product: { unitType: string }, isBannerCategory: boolean, rollLengthFeet?: number | null) {
  if (product.unitType === "ROLL" && isBannerCategory) {
    return `Restock banner rolls${rollLengthFeet ? ` (${rollLengthFeet}ft each)` : ""}`;
  }

  if (product.unitType === "ROLL") {
    return "Restock rolls";
  }

  if (product.unitType === "UNIT") {
    return "Restock units";
  }

  return `Restock ${product.unitType.toLowerCase()}`;
}

function sanitizeProductInput(body: Record<string, unknown>) {
  const isService = body.isService == null ? false : asBoolean(body.isService, "Is service");
  // Any sellable service (material-linked or service-only) needs a customer-facing price.
  const requiresSellingPrice = isService;
  const unitType = normalizeUnitType(asString(body.unitType, { field: "Unit type", min: 2, max: 20 })!);
  const legacyRollLengthMeters = asNumber(body.rollLengthMeters, { field: "Roll length (meters)", min: 0.1, optional: true });
  const parsedRollLengthFeet = asNumber(body.rollLengthFeet, { field: "Roll length (feet)", min: 0.1, optional: true });
  const rollLengthFeet = unitType === "ROLL"
    ? parsedRollLengthFeet ?? (legacyRollLengthMeters ? metersToFeet(legacyRollLengthMeters) : undefined) ?? config.inventory.standardRollLengthFeet
    : undefined;
  const parsedRollWidthFeet = asNumber(body.rollWidthFeet, { field: "Roll width (feet)", min: 0.1, optional: true });
  const rollWidthFeet = unitType === "ROLL" ? (parsedRollWidthFeet && parsedRollWidthFeet > 0 ? parsedRollWidthFeet : undefined) : undefined;
  const rollCount = asNumber(body.rollCount, { field: "Roll count", min: 0.01, optional: true });
  const currentStockInput = asNumber(body.currentStock, { field: "Current stock", min: 0, optional: true }) ?? 0;
  const currentStock = unitType === "ROLL" && rollCount && rollCount > 0 ? rollCount : currentStockInput;

  return {
    name: asString(body.name, { field: "Product name", min: 2, max: 120 })!,
    sku: asString(body.sku, { field: "SKU", min: 2, max: 40, optional: true }),
    barcode: asString(body.barcode, { field: "Barcode", max: 64, optional: true }),
    categoryId: asString(body.categoryId, { field: "Category", optional: true }),
    supplierId: asString(body.supplierId, { field: "Supplier", optional: true }),
    unitType,
    buyingPrice: asNumber(body.buyingPrice, { field: "Buying price", min: 0, optional: true }) ?? 0,
    sellingPrice: requiresSellingPrice
      ? asNumber(body.sellingPrice, { field: "Selling price", min: 0 })!
      : asNumber(body.sellingPrice, { field: "Selling price", min: 0, optional: true }) ?? 0,
    currentStock,
    minimumStockThreshold: asNumber(body.minimumStockThreshold, { field: "Minimum stock threshold", min: 0 }) ?? 0,
    rollLengthFeet,
    rollWidthFeet,
    rollCount,
    isService,
    materialId: isService ? asString(body.materialId, { field: "Linked material", optional: true }) : undefined,
    status: body.status ? ensureStatus(body.status) : "ACTIVE",
  };
}

function sanitizeProductUpdateInput(body: Record<string, unknown>) {
  const isService = body.isService == null ? false : asBoolean(body.isService, "Is service");
  // Any sellable service (material-linked or service-only) needs a customer-facing price.
  const requiresSellingPrice = isService;
  const unitType = normalizeUnitType(asString(body.unitType, { field: "Unit type", min: 2, max: 20 })!);
  const legacyRollLengthMeters = asNumber(body.rollLengthMeters, { field: "Roll length (meters)", min: 0.1, optional: true });
  const parsedRollLengthFeet = asNumber(body.rollLengthFeet, { field: "Roll length (feet)", min: 0.1, optional: true });
  const rollLengthFeet = unitType === "ROLL"
    ? parsedRollLengthFeet ?? (legacyRollLengthMeters ? metersToFeet(legacyRollLengthMeters) : undefined) ?? config.inventory.standardRollLengthFeet
    : undefined;
  const parsedRollWidthFeet = asNumber(body.rollWidthFeet, { field: "Roll width (feet)", min: 0.1, optional: true });
  const rollWidthFeet = unitType === "ROLL" ? (parsedRollWidthFeet && parsedRollWidthFeet > 0 ? parsedRollWidthFeet : undefined) : undefined;

  return {
    name: asString(body.name, { field: "Product name", min: 2, max: 120 })!,
    sku: asString(body.sku, { field: "SKU", min: 2, max: 40, optional: true }),
    barcode: asString(body.barcode, { field: "Barcode", max: 64, optional: true }),
    categoryId: asString(body.categoryId, { field: "Category", optional: true }),
    supplierId: asString(body.supplierId, { field: "Supplier", optional: true }),
    unitType,
    buyingPrice: asNumber(body.buyingPrice, { field: "Buying price", min: 0, optional: true }) ?? 0,
    sellingPrice: requiresSellingPrice
      ? asNumber(body.sellingPrice, { field: "Selling price", min: 0 })!
      : asNumber(body.sellingPrice, { field: "Selling price", min: 0, optional: true }) ?? 0,
    minimumStockThreshold: asNumber(body.minimumStockThreshold, { field: "Minimum stock threshold", min: 0 }) ?? 0,
    rollLengthFeet,
    rollWidthFeet,
    rollCount: asNumber(body.rollCount, { field: "Roll count", min: 0.01, optional: true }),
    isService,
    materialId: isService ? asString(body.materialId, { field: "Linked material", optional: true }) : undefined,
    status: body.status ? ensureStatus(body.status) : "ACTIVE",
  };
}

function sanitizeBannerPresetInput(body: Record<string, unknown>) {
  return {
    name: asString(body.name, { field: "Preset name", min: 2, max: 80 })!,
    width: asNumber(body.width, { field: "Width", min: 0.1 })!,
    height: asNumber(body.height, { field: "Height", min: 0.1 })!,
    isActive: body.isActive == null ? true : asBoolean(body.isActive, "Active"),
  };
}

function sanitizeCustomerInput(body: Record<string, unknown>) {
  return {
    name: asString(body.name, { field: "Customer name", min: 2, max: 120 })!,
    phone: asString(body.phone, { field: "Phone", max: 40, optional: true }),
    email: body.email ? asEmail(body.email, "Customer email") : undefined,
    address: asString(body.address, { field: "Address", max: 240, optional: true }),
  };
}

function sanitizeSupplierInput(body: Record<string, unknown>) {
  return {
    name: asString(body.name, { field: "Supplier name", min: 2, max: 120 })!,
    contactPerson: asString(body.contactPerson, { field: "Contact person", max: 120, optional: true }),
    phone: asString(body.phone, { field: "Phone", max: 40, optional: true }),
    email: body.email ? asEmail(body.email, "Supplier email") : undefined,
    address: asString(body.address, { field: "Address", max: 240, optional: true }),
    taxNumber: asString(body.taxNumber, { field: "Tax number", max: 80, optional: true }),
    paymentTerms: asString(body.paymentTerms, { field: "Payment terms", max: 120, optional: true }),
    leadTimeDays: asNumber(body.leadTimeDays, { field: "Lead time (days)", min: 0, optional: true }),
    bankName: asString(body.bankName, { field: "Bank name", max: 120, optional: true }),
    bankAccountNumber: asString(body.bankAccountNumber, { field: "Bank account number", max: 80, optional: true }),
    notes: asString(body.notes, { field: "Notes", max: 500, optional: true }),
    status: body.status ? ensureStatus(body.status) : "ACTIVE",
  };
}

function sanitizeSupplierSupplyRecordInput(body: Record<string, unknown>) {
  const suppliedAtInput = asString(body.suppliedAt, { field: "Supplied date", optional: true });
  const suppliedAt = suppliedAtInput ? new Date(`${suppliedAtInput}T12:00:00`) : new Date();

  if (Number.isNaN(suppliedAt.getTime())) {
    throw new ApiError(400, "Supplied date is invalid");
  }

  return {
    productId: asString(body.productId, { field: "Inventory item", optional: true }),
    itemName: asString(body.itemName, { field: "Item name", min: 1, max: 120 })!,
    quantity: asNumber(body.quantity, { field: "Quantity", min: 0.01 })!,
    unitPrice: asNumber(body.unitPrice, { field: "Price", min: 0 })!,
    notes: asString(body.notes, { field: "Notes", max: 300, optional: true }),
    suppliedAt,
  };
}

function sanitizeSupplierSupplyRecordBatchInput(body: unknown) {
  if (!Array.isArray(body) || !body.length) {
    throw new ApiError(400, "At least one supplier record is required");
  }

  if (body.length > 50) {
    throw new ApiError(400, "You can add up to 50 records at a time");
  }

  return body.map((row, index) =>
    sanitizeSupplierSupplyRecordInput({
      ...(typeof row === "object" && row ? (row as Record<string, unknown>) : {}),
      productId: (row as any)?.productId,
      itemName: (row as any)?.itemName,
      quantity: (row as any)?.quantity,
      unitPrice: (row as any)?.unitPrice,
      notes: (row as any)?.notes,
      suppliedAt: (row as any)?.suppliedAt,
    }),
  );
}

function sanitizeSupplierSupplyItemInput(body: Record<string, unknown>) {
  return {
    name: asString(body.name, { field: "Item name", min: 1, max: 120 })!,
    productId: asString(body.productId, { field: "Inventory item", optional: true }),
    categoryId: asString(body.categoryId, { field: "Category", optional: true }),
    unitType: (() => {
      const value = asString(body.unitType, { field: "Unit type", min: 2, max: 20, optional: true });
      return value ? normalizeUnitType(value) : undefined;
    })(),
    buyingPrice: asNumber(body.buyingPrice, { field: "Buying price", min: 0, optional: true }),
    minimumStockThreshold: asNumber(body.minimumStockThreshold, { field: "Minimum stock threshold", min: 0, optional: true }) ?? 0,
    rollLengthFeet: asNumber(body.rollLengthFeet, { field: "Roll length (feet)", min: 0.1, optional: true }),
  };
}

function sanitizeUserInput(body: Record<string, unknown>, requirePassword: true): {
  name: string;
  email: string;
  password: string;
  role: string;
  status: string;
};
function sanitizeUserInput(body: Record<string, unknown>, requirePassword?: false): {
  name: string;
  email: string;
  password?: string;
  role: string;
  status: string;
};
function sanitizeUserInput(body: Record<string, unknown>, requirePassword = true) {
  return {
    name: asString(body.name, { field: "Full name", min: 2, max: 120 })!,
    email: asEmail(body.email),
    password: requirePassword ? asString(body.password, { field: "Password", min: 8, max: 128 })! : asString(body.password, { field: "Password", min: 8, max: 128, optional: true }),
    role: ensureRole(body.role),
    status: body.status ? ensureStatus(body.status) : "ACTIVE",
  };
}

function sanitizeNotificationRecipientInput(body: Record<string, unknown>) {
  return {
    name: asString(body.name, { field: "Recipient name", min: 2, max: 120 })!,
    email: asEmail(body.email, "Recipient email"),
    isEnabled: body.isEnabled == null ? true : asBoolean(body.isEnabled, "Enabled"),
  };
}

function normalizeSqliteBoolean(value: boolean | number) {
  return typeof value === "boolean" ? value : value === 1;
}

function normalizeSqliteDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function serializeNotificationRecipient(record: NotificationRecipientRecord) {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    isEnabled: normalizeSqliteBoolean(record.isEnabled),
    notificationType: record.notificationType,
    createdAt: normalizeSqliteDate(record.createdAt),
    updatedAt: normalizeSqliteDate(record.updatedAt),
  };
}

async function listInventoryNotificationRecipients(client: any = prisma) {
  return client.notificationRecipient.findMany({
    where: {
      notificationType: "INVENTORY_REDUCTION",
    },
    orderBy: [
      { isEnabled: "desc" },
      { createdAt: "desc" },
    ],
  });
}

async function getInventoryNotificationRecipientById(id: string, client: any = prisma) {
  const recipient = await client.notificationRecipient.findUnique({
    where: { id },
  });

  if (!recipient) {
    throw new ApiError(404, "Notification recipient not found");
  }

  return recipient;
}

async function listEnabledInventoryNotificationRecipients(client: any = prisma) {
  return client.notificationRecipient.findMany({
    where: {
      notificationType: "INVENTORY_REDUCTION",
      isEnabled: true,
    },
    select: {
      name: true,
      email: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function syncLowStockAlerts(client: any = prisma) {
  const products: Array<{ id: string; currentStock: number; minimumStockThreshold: number }> = await client.product.findMany({
    where: { status: "ACTIVE", isService: false },
    select: {
      id: true,
      currentStock: true,
      minimumStockThreshold: true,
    },
  });

  const lowStockProducts = products.filter((product) => product.currentStock <= product.minimumStockThreshold);
  const lowStockMap = new Map<string, { id: string; currentStock: number; minimumStockThreshold: number }>(
    lowStockProducts.map((product) => [product.id, product]),
  );

  const activeAlerts: Array<{
    id: string;
    productId: string;
    currentStock: number;
    thresholdValue: number;
    status: string;
    createdAt: Date;
  }> = await client.stockAlert.findMany({
    where: {
      status: {
        in: ["UNREAD", "READ"],
      },
    },
    select: {
      id: true,
      productId: true,
      currentStock: true,
      thresholdValue: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const activeAlertByProductId = new Map<string, {
    id: string;
    productId: string;
    currentStock: number;
    thresholdValue: number;
    status: string;
    createdAt: Date;
  }>();
  const duplicateAlertIds: string[] = [];

  for (const alert of activeAlerts) {
    if (activeAlertByProductId.has(alert.productId)) {
      duplicateAlertIds.push(alert.id);
      continue;
    }

    activeAlertByProductId.set(alert.productId, alert);
  }

  if (duplicateAlertIds.length) {
    await client.stockAlert.updateMany({
      where: {
        id: {
          in: duplicateAlertIds,
        },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  }

  const toCreate = lowStockProducts
    .filter((product) => !activeAlertByProductId.has(product.id))
    .map((product) => ({
      productId: product.id,
      currentStock: product.currentStock,
      thresholdValue: product.minimumStockThreshold,
      status: "UNREAD",
    }));

  if (toCreate.length) {
    await client.stockAlert.createMany({
      data: toCreate,
    });
  }

  const resolveAlertIds = Array.from(activeAlertByProductId.values())
    .filter((alert) => !lowStockMap.has(alert.productId))
    .map((alert) => alert.id);

  if (resolveAlertIds.length) {
    await client.stockAlert.updateMany({
      where: {
        id: {
          in: resolveAlertIds,
        },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  }

  for (const [productId, product] of lowStockMap.entries()) {
    const alert = activeAlertByProductId.get(productId);
    if (!alert) {
      continue;
    }

    if (alert.currentStock !== product.currentStock || alert.thresholdValue !== product.minimumStockThreshold) {
      await client.stockAlert.update({
        where: { id: alert.id },
        data: {
          currentStock: product.currentStock,
          thresholdValue: product.minimumStockThreshold,
        },
      });
    }
  }
}

async function ensureInventoryMetaSchema() {
  // Prisma owns the schema now; `npm run db:push` creates and updates tables for PostgreSQL.
}

async function doesColumnExist(tableName: string, columnName: string) {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `;

  return Boolean(result[0]?.exists);
}

async function ensureBannerRollStockStoredInFeet() {
  const hasLegacyRollLengthMeters = await doesColumnExist("Product", "rollLengthMeters");

  if (hasLegacyRollLengthMeters) {
    const meterMigrationKey = "banner-roll-stock-stored-in-meters-v1";
    const meterMigration = await prisma.appMeta.findUnique({
      where: { key: meterMigrationKey },
    });

    if (meterMigration?.value !== "1") {
      await prisma.$executeRaw`
        UPDATE "Product"
        SET "currentStock" = ROUND(("currentStock" * "rollLengthMeters")::numeric, 4)::double precision,
            "minimumStockThreshold" = ROUND(("minimumStockThreshold" * "rollLengthMeters")::numeric, 4)::double precision
        WHERE "unitType" = 'ROLL'
          AND "rollLengthMeters" IS NOT NULL
          AND "categoryId" IN (
            SELECT "id"
            FROM "Category"
            WHERE lower("name") LIKE '%banner%'
          );
      `;

      await prisma.appMeta.upsert({
        where: { key: meterMigrationKey },
        update: { value: "1" },
        create: { key: meterMigrationKey, value: "1" },
      });
    }

    await prisma.$executeRaw`
      UPDATE "Product"
      SET "rollLengthFeet" = ROUND(("rollLengthMeters" * ${FEET_PER_METER})::numeric, 4)::double precision
      WHERE "rollLengthFeet" IS NULL
        AND "rollLengthMeters" IS NOT NULL;
    `;
  }

  const feetMigrationKey = "banner-roll-stock-stored-in-feet-v1";
  const feetMigration = await prisma.appMeta.findUnique({
    where: { key: feetMigrationKey },
  });

  if (feetMigration?.value === "1") {
    return;
  }

  await prisma.$executeRaw`
    UPDATE "Product"
    SET "currentStock" = ROUND(("currentStock" * ${FEET_PER_METER})::numeric, 4)::double precision,
        "minimumStockThreshold" = ROUND(("minimumStockThreshold" * ${FEET_PER_METER})::numeric, 4)::double precision
    WHERE "unitType" = 'ROLL'
      AND "rollLengthFeet" IS NOT NULL
      AND "categoryId" IN (
        SELECT "id"
        FROM "Category"
        WHERE lower("name") LIKE '%banner%'
      );
  `;

  await prisma.appMeta.upsert({
    where: { key: feetMigrationKey },
    update: { value: "1" },
    create: { key: feetMigrationKey, value: "1" },
  });
}

async function getRollMetaByProductIds(productIds: string[], client: any = prisma) {
  if (!productIds.length) {
    return new Map<string, { rollLengthFeet: number | null; rollWidthFeet: number | null }>();
  }

  const rows = await client.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      rollLengthFeet: true,
      rollWidthFeet: true,
    },
  });

  const map = new Map<string, { rollLengthFeet: number | null; rollWidthFeet: number | null }>();
  for (const row of rows) {
    map.set(row.id, {
      rollLengthFeet: row.rollLengthFeet,
      rollWidthFeet: row.rollWidthFeet,
    });
  }
  return map;
}

function serializeBannerPreset(row: BannerPresetRow) {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    isActive: normalizeSqliteBoolean(row.isActive),
    createdAt: normalizeSqliteDate(row.createdAt),
    updatedAt: normalizeSqliteDate(row.updatedAt),
  };
}

function serializeSupplierSupplyRecord(row: SupplierSupplyRecordRow) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    itemName: row.itemName,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    notes: row.notes,
    suppliedAt: normalizeSqliteDate(row.suppliedAt),
    createdAt: normalizeSqliteDate(row.createdAt),
  };
}

function serializeSupplierSupplyItem(row: SupplierSupplyItemRow) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    name: row.name,
    createdAt: normalizeSqliteDate(row.createdAt),
  };
}

function serializeStockAlertAsNotification(alert: {
  id: string;
  status: string;
  createdAt: Date;
  productId: string;
  thresholdValue: number;
  product: {
    name: string;
    currentStock: number;
    unitType: string;
  };
}): AppNotificationItem {
  return {
    id: alert.id,
    type: "LOW_STOCK",
    status: alert.status,
    title: `Low stock: ${alert.product.name}`,
    message: `${alert.product.currentStock.toFixed(2)} ${alert.product.unitType} remaining (threshold ${alert.thresholdValue.toFixed(2)})`,
    createdAt: alert.createdAt,
    productId: alert.productId,
    productName: alert.product.name,
    currentStock: alert.product.currentStock,
    thresholdValue: alert.thresholdValue,
  };
}

function serializeAuditLog(entry: AuditLogListItem) {
  return {
    id: entry.id,
    action: entry.action,
    module: entry.module,
    details: entry.details,
    createdAt: entry.createdAt,
    user: entry.user,
  };
}

function sanitizeSaleItems(items: Record<string, unknown>[]) {
  return items.map((item, index) => {
    const quantity = asNumber(item.quantity, { field: `Item ${index + 1} quantity`, min: 0.01 })!;
    const sellingPrice = asNumber(item.sellingPrice, { field: `Item ${index + 1} selling price`, min: 0 })!;
    const buyingPrice = asNumber(item.buyingPrice, { field: `Item ${index + 1} buying price`, min: 0, optional: true });
    const wastage = asNumber(item.wastage, { field: `Item ${index + 1} wastage`, min: 0, optional: true }) ?? 0;
    const designerCost = asNumber(item.designerCost, { field: `Item ${index + 1} designer cost`, min: 0, optional: true }) ?? 0;
    const discount = asNumber(item.discount, { field: `Item ${index + 1} discount`, min: 0, optional: true }) ?? 0;
    const width = asNumber(item.width, { field: `Item ${index + 1} width`, min: 0.01, optional: true });
    const height = asNumber(item.height, { field: `Item ${index + 1} height`, min: 0.01, optional: true });

    return {
      productId: asString(item.productId, { field: `Item ${index + 1} product`, min: 1 })!,
      quantity,
      buyingPrice,
      wastage,
      sellingPrice,
      designerCost,
      discount,
      width,
      height,
    };
  });
}

export async function createApp() {
  await prisma.$connect();
  await ensureInventoryMetaSchema();
  await ensureLengthUnitsStoredAsFeet();
  await ensureBannerRollStockStoredInFeet();
  await ensureAdminUser(prisma);

  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      environment: config.env,
      timestamp: new Date().toISOString(),
    });
  });

  app.get(
    "/api/shop-profile",
    asyncHandler(async (_req, res) => {
      res.json(await getShopProfile());
    }),
  );

  app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
      const email = asEmail(req.body?.email);
      const password = asString(req.body?.password, { field: "Password", min: 8, max: 128 })!;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new ApiError(401, "Invalid email or password");
      }

      if (user.status !== "ACTIVE") {
        throw new ApiError(403, "This account is inactive");
      }

      const token = createAuthToken({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      res.json({
        token,
        user: serializePublicUser(user),
      });
    }),
  );

  app.get(
    "/api/auth/me",
    authenticate,
    asyncHandler(async (req, res) => {
      const user = await prisma.user.findUnique({
        where: { id: (req as AuthenticatedRequest).user.id },
        select: publicUserSelect,
      });

      if (!user) {
        throw new ApiError(404, "User not found");
      }

      res.json(user);
    }),
  );

  app.get(
    "/api/dashboard/stats",
    authenticate,
    asyncHandler(async (_req, res) => {
      const todayStart = startOfDay();
      const yesterdayStart = addDays(todayStart, -1);
      const weekStart = addDays(todayStart, -6);
      const previousWeekStart = addDays(weekStart, -7);
      const sevenDayKeys = Array.from({ length: 7 }, (_, index) => formatDayKey(addDays(weekStart, index)));

      const [
        recentSalesWindow,
        todayWastageAggregate,
        recentWastageTransactions,
        lowStockCandidates,
        activeProducts,
        recentSales,
      ] =
        await Promise.all([
          prisma.sale.findMany({
            where: { createdAt: { gte: previousWeekStart } },
            select: {
              id: true,
              total: true,
              createdAt: true,
              items: {
                select: {
                  productId: true,
                  quantity: true,
                  buyingPrice: true,
                  designerCost: true,
                  total: true,
                  product: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "asc" },
          }),
          prisma.inventoryTransaction.aggregate({
            where: { transactionType: "WASTAGE", createdAt: { gte: todayStart } },
            _sum: { quantity: true },
          }),
          prisma.inventoryTransaction.findMany({
            where: {
              transactionType: "WASTAGE",
              createdAt: { gte: previousWeekStart },
            },
            select: {
              quantity: true,
              createdAt: true,
              product: {
                select: {
                  buyingPrice: true,
                },
              },
            },
          }),
          prisma.product.findMany({
            where: { status: "ACTIVE", isService: false },
            select: {
              id: true,
              name: true,
              sku: true,
              unitType: true,
              currentStock: true,
              minimumStockThreshold: true,
            },
          }),
          prisma.product.findMany({
            where: { status: "ACTIVE", isService: false },
            select: { currentStock: true, minimumStockThreshold: true, buyingPrice: true },
          }),
          prisma.sale.findMany({
            take: 6,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              createdAt: true,
              cashier: {
                select: { name: true },
              },
            },
          }),
        ] as const);
      const todaySales = recentSalesWindow.filter((sale) => sale.createdAt >= todayStart);
      const yesterdaySales = recentSalesWindow.filter((sale) => sale.createdAt >= yesterdayStart && sale.createdAt < todayStart);
      const thisWeekSales = recentSalesWindow.filter((sale) => sale.createdAt >= weekStart);
      const previousWeekSales = recentSalesWindow.filter((sale) => sale.createdAt >= previousWeekStart && sale.createdAt < weekStart);

      const todaySalesCount = todaySales.length;
      const todayRevenue = Number(todaySales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2));
      const todayCost = calculateSaleCost(todaySales.flatMap((sale) => sale.items));
      const todayWastageCost = Number(
        recentWastageTransactions
          .filter((entry) => entry.createdAt >= todayStart)
          .reduce((sum, entry) => sum + entry.quantity * (entry.product?.buyingPrice ?? 0), 0)
          .toFixed(2),
      );
      const weekWastageCost = Number(
        recentWastageTransactions
          .filter((entry) => entry.createdAt >= weekStart)
          .reduce((sum, entry) => sum + entry.quantity * (entry.product?.buyingPrice ?? 0), 0)
          .toFixed(2),
      );
      const previousWeekWastageCost = Number(
        recentWastageTransactions
          .filter((entry) => entry.createdAt >= previousWeekStart && entry.createdAt < weekStart)
          .reduce((sum, entry) => sum + entry.quantity * (entry.product?.buyingPrice ?? 0), 0)
          .toFixed(2),
      );
      const yesterdayWastageCost = Number(
        recentWastageTransactions
          .filter((entry) => entry.createdAt >= yesterdayStart && entry.createdAt < todayStart)
          .reduce((sum, entry) => sum + entry.quantity * (entry.product?.buyingPrice ?? 0), 0)
          .toFixed(2),
      );
      const todayProfit = Number((calculateSaleProfit(todayRevenue, todaySales.flatMap((sale) => sale.items)) - todayWastageCost).toFixed(2));
      const weekRevenue = Number(thisWeekSales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2));
      const weekProfit = Number((thisWeekSales.reduce((sum, sale) => sum + calculateSaleProfit(sale.total, sale.items), 0) - weekWastageCost).toFixed(2));
      const previousWeekRevenue = Number(previousWeekSales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2));
      const previousWeekProfit = Number((previousWeekSales.reduce((sum, sale) => sum + calculateSaleProfit(sale.total, sale.items), 0) - previousWeekWastageCost).toFixed(2));
      const yesterdayRevenue = Number(yesterdaySales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2));
      const yesterdayProfit = Number((yesterdaySales.reduce((sum, sale) => sum + calculateSaleProfit(sale.total, sale.items), 0) - yesterdayWastageCost).toFixed(2));

      const lowStockCount = lowStockCandidates.reduce((count, product) => {
        return count + (product.currentStock <= product.minimumStockThreshold ? 1 : 0);
      }, 0);
      const lowStockItems = lowStockCandidates
        .filter((product) => product.currentStock <= product.minimumStockThreshold)
        .sort((left, right) => {
          const leftRatio = left.minimumStockThreshold > 0 ? left.currentStock / left.minimumStockThreshold : left.currentStock;
          const rightRatio = right.minimumStockThreshold > 0 ? right.currentStock / right.minimumStockThreshold : right.currentStock;
          return leftRatio - rightRatio;
        })
        .slice(0, 8);

      const inventoryCostValue = Number(
        activeProducts.reduce((sum, product) => sum + product.currentStock * product.buyingPrice, 0).toFixed(2),
      );

      const weeklyMap = new Map<string, { sales: number; revenue: number; profit: number }>();
      for (const key of sevenDayKeys) {
        weeklyMap.set(key, { sales: 0, revenue: 0, profit: 0 });
      }

      for (const sale of thisWeekSales) {
        const key = formatDayKey(sale.createdAt);
        const bucket = weeklyMap.get(key);
        if (bucket) {
          bucket.sales += 1;
          bucket.revenue += sale.total;
          bucket.profit += calculateSaleProfit(sale.total, sale.items);
        }
      }

      const topProductMap = new Map<string, { id: string; name: string; quantity: number; revenue: number; profit: number }>();
      for (const sale of thisWeekSales) {
        for (const item of sale.items) {
          if (!item.product) {
            continue;
          }

          const current =
            topProductMap.get(item.product.id) ?? {
              id: item.product.id,
              name: item.product.name,
              quantity: 0,
              revenue: 0,
              profit: 0,
            };

          current.quantity += item.quantity;
          current.revenue += item.total;
          current.profit += calculateItemProfit(item.total, item.quantity, item.buyingPrice, 0, item.designerCost ?? 0);
          topProductMap.set(item.product.id, current);
        }
      }

      const compareAgainst = (current: number, previous: number) => {
        if (previous === 0) {
          return current > 0 ? 100 : 0;
        }

        return Number((((current - previous) / previous) * 100).toFixed(1));
      };

      res.json({
        todaySales: todaySalesCount,
        todayRevenue,
        todayCost,
        todayProfit,
        todayMargin: todayRevenue ? Number(((todayProfit / todayRevenue) * 100).toFixed(2)) : 0,
        todayWastage: Number((todayWastageAggregate._sum.quantity ?? 0).toFixed(2)),
        todayWastageCost,
        lowStockCount,
        lowStockItems,
        inventoryCostValue,
        weekRevenue,
        weekProfit,
        weekMargin: weekRevenue ? Number(((weekProfit / weekRevenue) * 100).toFixed(2)) : 0,
        trends: {
          salesVsYesterday: compareAgainst(todaySalesCount, yesterdaySales.length),
          revenueVsYesterday: compareAgainst(todayRevenue, yesterdayRevenue),
          profitVsYesterday: compareAgainst(todayProfit, yesterdayProfit),
          revenueVsPreviousWeek: compareAgainst(weekRevenue, previousWeekRevenue),
          profitVsPreviousWeek: compareAgainst(weekProfit, previousWeekProfit),
        },
        weeklySales: Array.from(weeklyMap.entries()).map(([date, metrics]) => ({
          date,
          label: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
          sales: metrics.sales,
          revenue: Number(metrics.revenue.toFixed(2)),
          profit: Number(metrics.profit.toFixed(2)),
          margin: metrics.revenue ? Number(((metrics.profit / metrics.revenue) * 100).toFixed(2)) : 0,
        })),
        topProducts: Array.from(topProductMap.values())
          .sort((left, right) => right.profit - left.profit)
          .slice(0, 5)
          .map((product) => ({
            ...product,
            revenue: Number(product.revenue.toFixed(2)),
            profit: Number(product.profit.toFixed(2)),
            margin: product.revenue ? Number(((product.profit / product.revenue) * 100).toFixed(2)) : 0,
          })),
        recentActivity: recentSales.map((sale) => ({
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          total: sale.total,
          cashierName: sale.cashier.name,
          createdAt: sale.createdAt,
        })),
      });
    }),
  );

  app.put(
    "/api/shop-profile",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const profile = sanitizeShopProfileInput(req.body);

      if (profile.printerName && !(await getSystemPrinters()).includes(profile.printerName)) {
        throw new ApiError(400, "Select a printer that is currently available");
      }

      await saveShopProfile(profile);
      await prisma.auditLog.create({
        data: {
          userId: authUser.id,
          module: "settings",
          action: "UPDATE_SHOP_PROFILE",
          details: `Updated shop profile to ${profile.shopName}`,
        },
      });

      res.json(await getShopProfile());
    }),
  );

  app.get(
    "/api/printers",
    authenticate,
    requireRoles("ADMIN", "CASHIER"),
    asyncHandler(async (_req, res) => {
      res.json({ printers: await getSystemPrinters() });
    }),
  );

  app.patch(
    "/api/printer-selection",
    authenticate,
    requireRoles("ADMIN", "CASHIER"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const printerName = asString(req.body?.printerName, { field: "Printer", max: 180, optional: true });

      if (printerName && !(await getSystemPrinters()).includes(printerName)) {
        throw new ApiError(400, "Select a printer that is currently available");
      }

      await prisma.appMeta.upsert({
        where: { key: SHOP_PROFILE_META_KEYS.printerName },
        update: { value: printerName || "" },
        create: { key: SHOP_PROFILE_META_KEYS.printerName, value: printerName || "" },
      });
      await prisma.auditLog.create({
        data: {
          userId: authUser.id,
          module: "settings",
          action: "UPDATE_PRINTER",
          details: printerName ? `Selected invoice printer ${printerName}` : "Cleared invoice printer selection",
        },
      });

      res.json(await getShopProfile());
    }),
  );

  app.post(
    "/api/print/invoice",
    authenticate,
    requireRoles("ADMIN", "CASHIER"),
    asyncHandler(async (req, res) => {
      const profile = await getShopProfile();
      if (!profile.printerName) throw new ApiError(409, "No printer is saved in Settings");

      const markup = asString(req.body?.markup, { field: "Invoice", min: 20, max: 900_000 })!;
      await printB5Invoice(profile.printerName, markup);
      res.json({ printed: true, printerName: profile.printerName });
    }),
  );

  app.get(
    "/api/notifications",
    authenticate,
    asyncHandler(async (req, res) => {
      await syncLowStockAlerts(prisma);
      const limit = getLimit(req.query, 20, 50);
      const status = typeof req.query.status === "string" && req.query.status !== "ALL" ? req.query.status : undefined;

      const alerts = await prisma.stockAlert.findMany({
        where: {
          ...(status ? { status } : { status: { in: ["UNREAD", "READ"] } }),
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              currentStock: true,
              unitType: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
      });

      const unreadCount = await prisma.stockAlert.count({
        where: { status: "UNREAD" },
      });

      const items = alerts.map(serializeStockAlertAsNotification);
      res.json({
        unreadCount,
        items,
      });
    }),
  );

  app.patch(
    "/api/notifications/:id/read",
    authenticate,
    requireRoles("ADMIN", "CASHIER", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const alertId = asString(req.params.id, { field: "Notification", min: 1 })!;
      const alert = await prisma.stockAlert.findUnique({
        where: { id: alertId },
        select: { id: true, status: true },
      });

      if (!alert) {
        throw new ApiError(404, "Notification not found");
      }

      if (alert.status !== "UNREAD") {
        res.json({ success: true });
        return;
      }

      await prisma.stockAlert.update({
        where: { id: alertId },
        data: { status: "READ" },
      });

      res.json({ success: true });
    }),
  );

  app.patch(
    "/api/notifications/read-all",
    authenticate,
    requireRoles("ADMIN", "CASHIER", "INVENTORY_MANAGER"),
    asyncHandler(async (_req, res) => {
      await prisma.stockAlert.updateMany({
        where: { status: "UNREAD" },
        data: { status: "READ" },
      });

      res.json({ success: true });
    }),
  );

  app.get(
    "/api/notifications/recipients",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (_req, res) => {
      const recipients = await listInventoryNotificationRecipients();

      res.json({
        recipients,
        mail: getNotificationMailStatus(),
      });
    }),
  );

  app.post(
    "/api/notifications/recipients",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const payload = sanitizeNotificationRecipientInput(req.body);

      const createdRecipient = await prisma.$transaction(async (tx) => {
        const recipientId = randomUUID();
        const recipient = await tx.notificationRecipient.create({
          data: {
            id: recipientId,
            name: payload.name,
            email: payload.email,
            isEnabled: payload.isEnabled,
            notificationType: "INVENTORY_REDUCTION",
          },
        });

        await recordAuditLog(tx, authUser.id, "notifications", "CREATE_RECIPIENT", `Added inventory recipient ${recipient.email}`);
        return recipient;
      });

      res.status(201).json(createdRecipient);
    }),
  );

  app.put(
    "/api/notifications/recipients/:id",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const payload = sanitizeNotificationRecipientInput(req.body);
      const recipientId = asString(req.params.id, { field: "Recipient", min: 1 })!;

      const updatedRecipient = await prisma.$transaction(async (tx) => {
        await getInventoryNotificationRecipientById(recipientId, tx);

        const recipient = await tx.notificationRecipient.update({
          where: { id: recipientId },
          data: {
            name: payload.name,
            email: payload.email,
            isEnabled: payload.isEnabled,
          },
        });

        await recordAuditLog(
          tx,
          authUser.id,
          "notifications",
          "UPDATE_RECIPIENT",
          `Updated inventory recipient ${recipient.email} (${recipient.isEnabled ? "enabled" : "disabled"})`,
        );

        return recipient;
      });

      res.json(updatedRecipient);
    }),
  );

  app.delete(
    "/api/notifications/recipients/:id",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const recipientId = asString(req.params.id, { field: "Recipient", min: 1 })!;

      await prisma.$transaction(async (tx) => {
        const recipient = await getInventoryNotificationRecipientById(recipientId, tx);
        await tx.notificationRecipient.delete({
          where: { id: recipientId },
        });

        await recordAuditLog(tx, authUser.id, "notifications", "DELETE_RECIPIENT", `Removed inventory recipient ${recipient.email}`);
      });

      res.status(204).send();
    }),
  );

  app.get(
    "/api/users",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
        select: publicUserSelect,
      });

      res.json(users);
    }),
  );

  app.post(
    "/api/users",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const payload = sanitizeUserInput(req.body, true);
      const passwordHash = await bcrypt.hash(payload.password, 10);

      const createdUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: payload.name,
            email: payload.email,
            passwordHash,
            role: payload.role,
            status: payload.status,
          },
          select: publicUserSelect,
        });

        await recordAuditLog(
          tx,
          (req as AuthenticatedRequest).user.id,
          "users",
          "CREATE_USER",
          `Created ${payload.role} account for ${payload.email}`,
        );

        return user;
      });

      res.status(201).json(createdUser);
    }),
  );

  app.put(
    "/api/users/:id",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const payload = sanitizeUserInput(req.body, false);
      const authUser = (req as AuthenticatedRequest).user;
      const targetUser = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, role: true },
      });

      if (!targetUser) {
        throw new ApiError(404, "User not found");
      }

      const adminCount = targetUser.role === "ADMIN"
        ? await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })
        : 0;

      if (targetUser.role === "ADMIN" && adminCount <= 1 && payload.role !== "ADMIN") {
        throw new ApiError(400, "At least one active admin must remain in the system");
      }

      const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: req.params.id },
          data: {
            name: payload.name,
            email: payload.email,
            role: payload.role,
            status: payload.status,
            ...(payload.password ? { passwordHash: await bcrypt.hash(payload.password, 10) } : {}),
          },
          select: publicUserSelect,
        });

        await recordAuditLog(
          tx,
          authUser.id,
          "users",
          "UPDATE_USER",
          `Updated ${req.params.id} (${payload.email})`,
        );

        return user;
      });

      res.json(updatedUser);
    }),
  );

  app.delete(
    "/api/users/:id",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;

      if (authUser.id === req.params.id) {
        throw new ApiError(400, "You cannot delete your own account");
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, email: true, role: true, _count: { select: { sales: true } } },
      });

      if (!targetUser) {
        throw new ApiError(404, "User not found");
      }

      if (targetUser.role === "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
        if (adminCount <= 1) {
          throw new ApiError(400, "At least one active admin must remain in the system");
        }
      }

      if (targetUser._count.sales > 0) {
        throw new ApiError(400, "This user has historical sales records and cannot be deleted");
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.delete({ where: { id: req.params.id } });
        await recordAuditLog(tx, authUser.id, "users", "DELETE_USER", `Deleted ${targetUser.email}`);
      });

      res.json({ success: true });
    }),
  );

  app.get(
    "/api/audit-logs",
    authenticate,
    requireRoles("ADMIN", "AUDITOR"),
    asyncHandler(async (req, res) => {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const moduleFilter = typeof req.query.module === "string" && req.query.module !== "ALL"
        ? req.query.module.trim().toLowerCase()
        : undefined;
      const page = getPage(req.query);
      const limit = getLimit(req.query, 20, 100);
      const { start, end } = getDateRange(req.query);

      const where: Prisma.AuditLogWhereInput = {
        ...(moduleFilter ? { module: moduleFilter } : {}),
        ...(buildDateRangeFilter(start, end) ? { createdAt: buildDateRangeFilter(start, end) } : {}),
        ...(search
          ? {
              OR: [
                { action: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { module: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { details: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { user: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
                { user: { email: { contains: search, mode: Prisma.QueryMode.insensitive } } },
              ],
            }
          : {}),
      };

      const [totalItems, items] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalItems / limit));

      res.json({
        items: items.map(serializeAuditLog),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
        },
      });
    }),
  );

  app.get(
    "/api/audit-logs/inventory-report",
    authenticate,
    requireRoles("ADMIN", "AUDITOR"),
    asyncHandler(async (_req, res) => {
      const products = await prisma.product.findMany({
        where: { isService: false },
        select: {
          id: true,
          name: true,
          sku: true,
          unitType: true,
          buyingPrice: true,
          currentStock: true,
          minimumStockThreshold: true,
          status: true,
          lastRestockDate: true,
        },
        orderBy: [{ currentStock: "asc" }, { name: "asc" }],
      });
      const activeProducts = products.filter((product) => product.status === "ACTIVE");
      const lowStockItems = activeProducts.filter((product) => product.currentStock <= product.minimumStockThreshold);
      const recentTransactions = await prisma.inventoryTransaction.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          product: { select: { id: true, name: true, sku: true, unitType: true } },
        },
      });

      res.json({
        summary: {
          totalMaterials: products.length,
          activeMaterials: activeProducts.length,
          lowStockCount: lowStockItems.length,
          outOfStockCount: activeProducts.filter((product) => product.currentStock <= 0).length,
          inventoryValue: Number(activeProducts.reduce(
            (total, product) => total + product.currentStock * product.buyingPrice,
            0,
          ).toFixed(2)),
        },
        lowStockItems: lowStockItems.slice(0, 20),
        recentTransactions,
      });
    }),
  );

  app.get(
    "/api/products",
    authenticate,
    asyncHandler(async (req, res) => {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const requestedStatus = typeof req.query.status === "string" ? req.query.status : undefined;
      const status = requestedStatus === "ALL" ? undefined : requestedStatus ?? "ACTIVE";
      const lowStockOnly = req.query.lowStock === "true";

      const products = await prisma.product.findMany({
        where: {
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { sku: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(status ? { status } : {}),
        },
        include: productInclude,
        orderBy: [{ createdAt: "desc" }],
      });

      const filteredProducts = lowStockOnly
        ? products.filter((product) => product.currentStock <= product.minimumStockThreshold)
        : products;
      res.json(filteredProducts);
    }),
  );

  app.post(
    "/api/products",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const payload = sanitizeProductInput(req.body);
      const isBannerRoll = payload.unitType === "ROLL";
      const initialStock = isBannerRoll
        ? resolveBannerRollFeet(payload.rollCount, payload.rollLengthFeet, payload.currentStock)
        : payload.currentStock;

      const { rollLengthFeet, rollWidthFeet, rollCount: _rollCount, ...productData } = payload;
      const authUser = (req as AuthenticatedRequest).user;

      const createdProduct = await prisma.$transaction(async (tx) => {
        const sku = payload.sku ?? await generateUniqueProductSku(payload.name, tx);
        const product = await tx.product.create({
          data: {
            ...productData,
            sku,
            currentStock: initialStock,
            rollLengthFeet: payload.unitType === "ROLL" ? rollLengthFeet ?? null : null,
            rollWidthFeet: payload.unitType === "ROLL" ? rollWidthFeet ?? null : null,
            materialId: payload.isService ? payload.materialId ?? null : null,
          },
          include: productInclude,
        });

        if (initialStock > 0) {
          await tx.inventoryTransaction.create({
            data: {
              productId: product.id,
              transactionType: "STOCK_IN",
              quantity: initialStock,
              reason: "Initial stock",
              performedBy: authUser.name,
            },
          });
        }

        await recordAuditLog(tx, authUser.id, "inventory", "CREATE_PRODUCT", `Created ${product.name}`);
        return product;
      });
      res.status(201).json(createdProduct);
    }),
  );

  app.put(
    "/api/products/:id",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const payload = sanitizeProductUpdateInput(req.body);
      const { rollLengthFeet, rollWidthFeet, rollCount: _rollCount, ...productData } = payload;
      const authUser = (req as AuthenticatedRequest).user;
      const productId = asString(req.params.id, { field: "Product", min: 1 })!;

      const existingProduct = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, sku: true },
      });

      if (!existingProduct) {
        throw new ApiError(404, "Product not found");
      }

      const updatedProduct = await prisma.$transaction(async (tx) => {
        const product = await tx.product.update({
          where: { id: productId },
          data: {
            ...productData,
            sku: payload.sku ?? existingProduct.sku,
            rollLengthFeet: payload.unitType === "ROLL" ? rollLengthFeet ?? null : null,
            rollWidthFeet: payload.unitType === "ROLL" ? rollWidthFeet ?? null : null,
            materialId: payload.isService ? payload.materialId ?? null : null,
          },
          include: productInclude,
        });

        await recordAuditLog(
          tx,
          authUser.id,
          "inventory",
          "UPDATE_PRODUCT",
          `Updated ${existingProduct.name} (${product.sku})`,
        );

        return product;
      });
      res.json(updatedProduct);
    }),
  );

  app.put(
    "/api/products/:id/supplier",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const productId = asString(req.params.id, { field: "Product", min: 1 })!;
      const supplierId = asString(req.body?.supplierId, { field: "Supplier", optional: true });

      const existingProduct = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true },
      });

      if (!existingProduct) {
        throw new ApiError(404, "Product not found");
      }

      if (supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true },
        });

        if (!supplier) {
          throw new ApiError(404, "Supplier not found");
        }
      }

      const updatedProduct = await prisma.product.update({
        where: { id: productId },
        data: {
          supplierId: supplierId ?? null,
        },
        include: productInclude,
      });

      res.json(updatedProduct);
    }),
  );

  app.delete(
    "/api/products/:id",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const productId = asString(req.params.id, { field: "Product", min: 1 })!;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          _count: {
            select: {
              saleItems: true,
              usedBy: true,
            },
          },
        },
      });

      if (!product) {
        throw new ApiError(404, "Product not found");
      }

      if (product._count.saleItems > 0) {
        await prisma.$transaction(async (tx) => {
          const detachedServices = await tx.product.updateMany({
            where: { materialId: productId },
            data: { materialId: null },
          });

          await tx.stockAlert.updateMany({
            where: { productId, status: "UNREAD" },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });

          if ((product.currentStock ?? 0) > 0) {
            await tx.inventoryTransaction.create({
              data: {
                productId,
                transactionType: "ADJUSTMENT_OUT",
                quantity: product.currentStock,
                performedBy: authUser.name,
                reason: "Archived product with sales history",
              },
            });
          }

          await tx.product.update({
            where: { id: productId },
            data: {
              status: "INACTIVE",
              currentStock: 0,
              minimumStockThreshold: 0,
              supplierId: null,
              materialId: null,
              isService: false,
            },
          });

          await recordAuditLog(
            tx,
            authUser.id,
            "inventory",
            "ARCHIVE_PRODUCT",
            `Archived ${product.name} (${product.sku}) with sales history; detached ${detachedServices.count} linked services`,
          );
        });

        res.json({
          success: true,
          archived: true,
          message: "Product archived successfully. Historical sales records are preserved.",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        if (product._count.usedBy > 0) {
          await tx.product.updateMany({
            where: { materialId: productId },
            data: { materialId: null },
          });
        }

        await tx.stockAlert.deleteMany({ where: { productId } });
        await tx.inventoryTransaction.deleteMany({ where: { productId } });
        await tx.product.delete({ where: { id: productId } });
        await recordAuditLog(tx, authUser.id, "inventory", "DELETE_PRODUCT", `Deleted ${product.name} (${product.sku})`);
      });

      res.json({ success: true, message: "Product deleted successfully." });
    }),
  );

  app.post(
    "/api/sales",
    authenticate,
    requireRoles("ADMIN", "CASHIER", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const items = sanitizeSaleItems(asArray<Record<string, unknown>>(req.body?.items, "Items"));
      if (!items.length) {
        throw new ApiError(400, "At least one sale item is required");
      }

      const discount = asNumber(req.body?.discount, { field: "Discount", min: 0, optional: true }) ?? 0;
      const paidAmount = asNumber(req.body?.paidAmount, { field: "Paid amount", min: 0 })!;
      const paymentMethod = ensurePaymentMethod(req.body?.paymentMethod);
      const customerId = asString(req.body?.customerId, { field: "Customer", optional: true });

      if (customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          select: { id: true },
        });
        if (!customer) {
          throw new ApiError(404, "Customer not found");
        }
      }

      const productIds = Array.from(new Set(items.map((item) => item.productId)));
      const products: any[] = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          category: {
            select: { name: true },
          },
          material: {
            select: {
              id: true,
              name: true,
              buyingPrice: true,
            },
          },
        },
      });
      const productMap = new Map(products.map((product) => [product.id, product]));

      if (productMap.size !== productIds.length) {
        throw new ApiError(404, "One or more products could not be found");
      }

      const saleLines = items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new ApiError(404, `Product ${item.productId} could not be found`);
        }

        if (product.status !== "ACTIVE") {
          throw new ApiError(400, `${product.name} is not available for sale`);
        }

        // Banners (area-billed SQFT services) are NOT auto-deducted from raw-material stock
        // anymore: a sq-ft area cannot be reliably converted into roll linear-feet at sale time
        // (it needs the roll width and a cutting/nesting decision), so roll stock is now managed
        // manually in the Inventory screen. Every other product type — including unit, meter and
        // roll services — still auto-reduces its linked material 1:1 as before.
        const isAreaBilledService = Boolean(product.isService && product.materialId && product.unitType === "SQFT");
        // Service-only products (e.g. graphics design) have no linked raw material, so nothing is deducted from stock.
        const isServiceWithoutMaterial = Boolean(product.isService && !product.materialId);
        const deductsStock = !isAreaBilledService && !isServiceWithoutMaterial;
        const isMaterialLinkedService = Boolean(product.isService && product.materialId);
        // resolveStockReductionQuantity still validates that a service is linked to a material.
        const stockReductionQuantity = deductsStock ? resolveStockReductionQuantity(product, item) : 0;
        const wastage = item.wastage ?? 0;
        const wastageReductionQuantity = deductsStock ? resolveWastageReductionQuantity(product, wastage) : 0;
        const totalReductionQuantity = Number((stockReductionQuantity + wastageReductionQuantity).toFixed(4));
        const targetProductId = isMaterialLinkedService ? product.materialId : product.id;
        const total = calculateItemTotal(item.quantity, item.sellingPrice, item.designerCost, item.discount);
        const effectiveBuyingPrice =
          product.isService && product.materialId
            ? product.material?.buyingPrice ?? item.buyingPrice ?? product.buyingPrice ?? 0
            : item.buyingPrice ?? product.buyingPrice ?? 0;

        return {
          product,
          targetProductId,
          deductsStock,
          quantity: item.quantity,
          stockReductionQuantity,
          wastageReductionQuantity,
          wastage,
          totalReductionQuantity,
          width: item.width,
          height: item.height,
          sellingPrice: item.sellingPrice,
          buyingPrice: effectiveBuyingPrice,
          designerCost: item.designerCost,
          discount: item.discount,
          total,
        };
      });

      const stockDemand = new Map<string, number>();
      for (const line of saleLines) {
        if (!line.deductsStock) {
          continue;
        }
        stockDemand.set(
          line.targetProductId,
          (stockDemand.get(line.targetProductId) ?? 0) + line.totalReductionQuantity,
        );
      }

      const targetProducts: any[] = await prisma.product.findMany({
        where: { id: { in: Array.from(stockDemand.keys()) } },
        select: {
          id: true,
          name: true,
          currentStock: true,
          minimumStockThreshold: true,
          unitType: true,
          rollLengthFeet: true,
          category: {
            select: { name: true },
          },
        },
      });
      const targetProductMap = new Map(targetProducts.map((product) => [product.id, product]));

      for (const [targetProductId, requiredQuantity] of stockDemand.entries()) {
        const targetProduct = targetProductMap.get(targetProductId);
        if (!targetProduct) {
          throw new ApiError(400, "A linked material product is missing");
        }

        const hasEnoughStock = targetProduct.currentStock + 0.000001 >= requiredQuantity;
        if (!hasEnoughStock) {
          const rollLengthFeet = targetProduct.rollLengthFeet ?? 0;
          if (isBannerRollProduct(targetProduct) && rollLengthFeet > 0) {
            const requiredFeet = Number(requiredQuantity.toFixed(2));
            const availableFeet = Number(targetProduct.currentStock.toFixed(2));
            const usage = getRollUsageBreakdown(requiredFeet, rollLengthFeet);
            const usageLabel = usage.partialFeet > 0
              ? `${usage.fullRolls} full rolls + ${usage.partialFeet.toFixed(2)}ft`
              : `${usage.fullRolls} full rolls`;

            throw new ApiError(
              400,
              `Insufficient stock for ${targetProduct.name}. Required ${requiredFeet.toFixed(2)} feet (${usageLabel}), available ${availableFeet.toFixed(2)} feet.`,
            );
          }

          if (targetProduct.unitType === "ROLL" && rollLengthFeet > 0) {
            throw new ApiError(
              400,
              `Insufficient stock for ${targetProduct.name}. Required ${requiredQuantity.toFixed(2)} rolls, available ${targetProduct.currentStock.toFixed(2)} rolls.`,
            );
          }

          throw new ApiError(
            400,
            `Insufficient stock for ${targetProduct.name}. Required ${requiredQuantity.toFixed(2)} ${targetProduct.unitType}, available ${targetProduct.currentStock.toFixed(2)} ${targetProduct.unitType}.`,
          );
        }
      }

      const subtotal = saleLines.reduce((sum, item) => sum + item.total, 0);
      const total = Number((subtotal - discount).toFixed(2));
      if (total < 0) {
        throw new ApiError(400, "Order total cannot be negative");
      }

      if (paidAmount < total && !customerId) {
        throw new ApiError(400, "Customer is required for unpaid orders");
      }

      const balance = Number((paidAmount - total).toFixed(2));
      const invoiceNumber = `INV-${Date.now().toString().slice(-10)}`;

      const saleResult = await prisma.$transaction(async (tx) => {
        const createdSale = await tx.sale.create({
          data: {
            invoiceNumber,
            customerId,
            cashierId: authUser.id,
            subtotal,
            discount,
            total,
            paidAmount,
            balance,
            paymentMethod,
            items: {
              create: saleLines.map((line) => ({
                productId: line.product.id,
                quantity: line.quantity,
                width: line.width,
                height: line.height,
                designerCost: line.designerCost,
                buyingPrice: line.buyingPrice,
                sellingPrice: line.sellingPrice,
                discount: line.discount,
                total: line.total,
              })),
            },
          },
          include: orderDetailInclude,
        });

        const touchedProductIds = Array.from(stockDemand.keys());
        for (const [targetProductId, requiredQuantity] of stockDemand.entries()) {
          const current = await tx.product.findUnique({
            where: { id: targetProductId },
            select: { id: true, name: true, currentStock: true },
          });
          if (!current) {
            throw new ApiError(400, "A linked material product is missing");
          }

          const nextStock = Number((current.currentStock - requiredQuantity).toFixed(4));
          if (nextStock < -0.000001) {
            throw new ApiError(
              400,
              `Insufficient stock for ${current.name}. Required ${requiredQuantity.toFixed(2)}, available ${current.currentStock.toFixed(2)}.`,
            );
          }

          await tx.product.update({
            where: { id: targetProductId },
            data: {
              currentStock: Math.max(0, nextStock),
            },
          });
        }

        await tx.inventoryTransaction.createMany({
          data: saleLines.filter((line) => line.deductsStock).flatMap((line) => {
            const salesOut = {
              productId: line.targetProductId,
              transactionType: "SALE_OUT",
              quantity: line.stockReductionQuantity,
              referenceId: createdSale.id,
              performedBy: authUser.name,
              reason: line.product.isService ? `Material allocated to ${line.product.name}` : `Sale ${createdSale.invoiceNumber}`,
            };

            if (line.wastage <= 0) {
              return [salesOut];
            }

            return [
              salesOut,
              {
                productId: line.targetProductId,
                transactionType: "WASTAGE",
                quantity: line.wastageReductionQuantity,
                referenceId: createdSale.id,
                performedBy: authUser.name,
                reason: `Wastage recorded for ${line.product.name} (${line.wastage.toFixed(2)} billed units)`,
              },
            ];
          }),
        });

        const refreshedProducts = await tx.product.findMany({
          where: { id: { in: touchedProductIds } },
          select: { id: true, name: true, currentStock: true, minimumStockThreshold: true },
        });

        const activeAlerts = await tx.stockAlert.findMany({
          where: {
            productId: { in: touchedProductIds },
            status: "UNREAD",
          },
          select: { productId: true },
        });
        const activeAlertProductIds = new Set(activeAlerts.map((alert) => alert.productId));

        for (const product of refreshedProducts) {
          if (product.currentStock <= product.minimumStockThreshold) {
            if (!activeAlertProductIds.has(product.id)) {
              await tx.stockAlert.create({
                data: {
                  productId: product.id,
                  currentStock: product.currentStock,
                  thresholdValue: product.minimumStockThreshold,
                },
              });
            }
          } else {
            await tx.stockAlert.updateMany({
              where: { productId: product.id, status: "UNREAD" },
              data: {
                status: "RESOLVED",
                resolvedAt: new Date(),
              },
            });
          }
        }

        await recordAuditLog(tx, authUser.id, "sales", "CREATE_SALE", `Created ${createdSale.invoiceNumber}`);
        const reductions = refreshedProducts.map((product) => {
          const previousStock = targetProductMap.get(product.id)?.currentStock ?? product.currentStock;
          const sourceProducts = Array.from(
            new Set(
              saleLines
                .filter((line) => line.targetProductId === product.id)
                .map((line) => line.product.name),
            ),
          );

          const wastageQuantity = saleLines
            .filter((line) => line.targetProductId === product.id)
            .reduce((sum, line) => sum + line.wastage, 0);

          return {
            productId: product.id,
            name: product.name,
            quantity: stockDemand.get(product.id) ?? 0,
            wastageQuantity: Number(wastageQuantity.toFixed(2)),
            unitType: isBannerRollProduct(targetProductMap.get(product.id))
              ? "FEET"
              : targetProductMap.get(product.id)?.unitType ?? "UNIT",
            previousStock,
            remainingStock: product.currentStock,
            minimumStockThreshold: product.minimumStockThreshold,
            sourceProducts,
          };
        });

        const lowStockReductions = reductions.filter(
          (entry) =>
            entry.remainingStock <= entry.minimumStockThreshold
            && entry.previousStock > entry.minimumStockThreshold,
        );

        return { sale: createdSale, reductions, lowStockReductions };
      });

      const enabledRecipients = await listEnabledInventoryNotificationRecipients();

      if (saleResult.lowStockReductions.length && enabledRecipients.length && config.notifications.smtp.enabled) {
        void sendInventoryReductionNotification({
          recipients: enabledRecipients,
          sale: {
            invoiceNumber: saleResult.sale.invoiceNumber,
            total: saleResult.sale.total,
            createdAt: saleResult.sale.createdAt,
            customerName: saleResult.sale.customer?.name,
            cashierName: authUser.name,
          },
          reductions: saleResult.lowStockReductions,
        }).catch((error) => {
          console.error("Failed to send inventory notification email", error);
        });
      }

      res.status(201).json(saleResult.sale);
    }),
  );

  app.get(
    "/api/banner-presets",
    authenticate,
    asyncHandler(async (_req, res) => {
      const presets = await prisma.bannerSizePreset.findMany({
        where: { isActive: true },
        orderBy: [{ width: "asc" }, { height: "asc" }],
      });
      res.json(presets);
    }),
  );

  app.post(
    "/api/banner-presets",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const payload = sanitizeBannerPresetInput(req.body);
      const authUser = (req as AuthenticatedRequest).user;

      const preset = await prisma.$transaction(async (tx) => {
        const id = randomUUID();
        const createdPreset = await tx.bannerSizePreset.create({
          data: {
            id,
            name: payload.name,
            width: payload.width,
            height: payload.height,
            isActive: payload.isActive,
          },
        });
        await recordAuditLog(tx, authUser.id, "inventory", "CREATE_BANNER_PRESET", `Created banner preset ${createdPreset.name}`);
        return createdPreset;
      });

      res.status(201).json(preset);
    }),
  );

  app.put(
    "/api/banner-presets/:id",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const payload = sanitizeBannerPresetInput(req.body);
      const authUser = (req as AuthenticatedRequest).user;

      const preset = await prisma.$transaction(async (tx) => {
        const existingPreset = await tx.bannerSizePreset.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!existingPreset) {
          throw new ApiError(404, "Banner preset not found");
        }
        const updatedPreset = await tx.bannerSizePreset.update({
          where: { id: req.params.id },
          data: {
            name: payload.name,
            width: payload.width,
            height: payload.height,
            isActive: payload.isActive,
          },
        });
        await recordAuditLog(tx, authUser.id, "inventory", "UPDATE_BANNER_PRESET", `Updated banner preset ${updatedPreset.name}`);
        return updatedPreset;
      });

      res.json(preset);
    }),
  );

  app.delete(
    "/api/banner-presets/:id",
    authenticate,
    requireRoles("ADMIN"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      await prisma.$transaction(async (tx) => {
        const preset = await tx.bannerSizePreset.findUnique({
          where: { id: req.params.id },
        });
        if (!preset) {
          throw new ApiError(404, "Banner preset not found");
        }
        await tx.bannerSizePreset.delete({
          where: { id: req.params.id },
        });
        await recordAuditLog(tx, authUser.id, "inventory", "DELETE_BANNER_PRESET", `Deleted banner preset ${preset.name}`);
      });
      res.status(204).send();
    }),
  );

  app.get(
    "/api/orders",
    authenticate,
    asyncHandler(async (req, res) => {
      const { start, end } = getDateRange(req.query);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const paymentMethod = resolveOrderPaymentFilter(req.query.paymentMethod);
      const paymentStatus = resolveOrderPaymentStatusFilter(req.query.paymentStatus);
      const customerId = resolveOrderCustomerFilter(req.query.customerType);
      const page = getPage(req.query);
      const limit = getLimit(req.query, 20, 100);
      const where: Prisma.SaleWhereInput = {
        ...(buildDateRangeFilter(start, end) ? { createdAt: buildDateRangeFilter(start, end) } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(paymentStatus ? { balance: paymentStatus } : {}),
        ...(customerId !== undefined ? { customerId } : {}),
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { customer: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
                { cashier: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
                { paymentMethod: { contains: search, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : {}),
      };

      const [totalItems, totals, orders] = await Promise.all([
        prisma.sale.count({ where }),
        prisma.sale.aggregate({
          where,
          _sum: { total: true },
          _avg: { total: true },
        }),
        prisma.sale.findMany({
          where,
          select: orderListSelect,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalItems / limit));

      res.json({
        items: orders.map((order) => ({
          ...order,
          itemsCount: order._count.items,
        })),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },
        summary: {
          totalOrders: totalItems,
          totalRevenue: totals._sum.total ?? 0,
          averageOrderValue: totals._avg.total ?? 0,
        },
      });
    }),
  );

  app.post(
    "/api/orders/:id/payments",
    authenticate,
    requireRoles("ADMIN", "CASHIER"),
    asyncHandler(async (req, res) => {
      const orderId = asString(req.params.id, { field: "Order", min: 1 })!;
      const amount = asNumber(req.body?.amount, { field: "Amount", min: 0.01 })!;
      const paymentMethod = req.body?.paymentMethod ? ensurePaymentMethod(req.body?.paymentMethod) : undefined;
      const authUser = (req as AuthenticatedRequest).user;

      const updatedSale = await prisma.$transaction(async (tx) => {
        const existing = await tx.sale.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            paidAmount: true,
            paymentMethod: true,
          },
        });

        if (!existing) {
          throw new ApiError(404, "Order not found");
        }

        const nextPaidAmount = Number((existing.paidAmount + amount).toFixed(2));
        const nextBalance = Number((nextPaidAmount - existing.total).toFixed(2));

        const sale = await tx.sale.update({
          where: { id: orderId },
          data: {
            paidAmount: nextPaidAmount,
            balance: nextBalance,
            ...(paymentMethod ? { paymentMethod } : {}),
          },
          include: orderDetailInclude,
        });

        await recordAuditLog(
          tx,
          authUser.id,
          "sales",
          "ORDER_PAYMENT_ADDED",
          `Added LKR ${amount.toFixed(2)} to ${existing.invoiceNumber}${paymentMethod ? ` via ${paymentMethod}` : ""}`,
        );

        return sale;
      });

      res.json(updatedSale);
    }),
  );

  app.get(
    "/api/orders/:id",
    authenticate,
    asyncHandler(async (req, res) => {
      const orderId = asString(req.params.id, { field: "Order", min: 1 })!;

      const order = await prisma.sale.findUnique({
        where: { id: orderId },
        include: orderDetailInclude,
      });

      if (!order) {
        throw new ApiError(404, "Order not found");
      }

      res.json(order);
    }),
  );

  app.get(
    "/api/suppliers",
    authenticate,
    asyncHandler(async (_req, res) => {
      const suppliers = await prisma.supplier.findMany({
        orderBy: { name: "asc" },
      });
      res.json(suppliers);
    }),
  );

  app.get(
    "/api/suppliers/:id/dashboard",
    authenticate,
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
      });

      if (!supplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const products = await prisma.product.findMany({
        where: { supplierId },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          category: {
            select: { id: true, name: true },
          },
        },
      });

      const productIds = products.map((product) => product.id);
      const [stockInCount, stockInAggregate, recentDeliveries] = productIds.length
        ? await Promise.all([
            prisma.inventoryTransaction.count({
              where: {
                productId: { in: productIds },
                transactionType: "STOCK_IN",
              },
            }),
            prisma.inventoryTransaction.aggregate({
              where: {
                productId: { in: productIds },
                transactionType: "STOCK_IN",
              },
              _sum: { quantity: true },
            }),
            prisma.inventoryTransaction.findMany({
              where: {
                productId: { in: productIds },
                transactionType: "STOCK_IN",
              },
              orderBy: { createdAt: "desc" },
              take: 20,
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    unitType: true,
                  },
                },
              },
            }),
          ])
        : [0, { _sum: { quantity: null } }, []];

      const lowStockProducts = products
        .filter((product) => product.status === "ACTIVE")
        .filter((product) => product.currentStock <= product.minimumStockThreshold).length;
      const activeProducts = products.filter((product) => product.status === "ACTIVE").length;

      res.json({
        supplier,
        stats: {
          totalProducts: products.length,
          activeProducts,
          lowStockProducts,
          deliveryCount: stockInCount,
          totalDeliveredQuantity: Number((stockInAggregate._sum.quantity ?? 0).toFixed(2)),
          lastDeliveryAt: recentDeliveries[0]?.createdAt ?? null,
        },
        products,
        deliveries: recentDeliveries,
      });
    }),
  );

  app.post(
    "/api/suppliers",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const supplier = await prisma.supplier.create({
        data: sanitizeSupplierInput(req.body),
      });
      res.status(201).json(supplier);
    }),
  );

  app.put(
    "/api/suppliers/:id",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const existingSupplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });

      if (!existingSupplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const supplier = await prisma.supplier.update({
        where: { id: supplierId },
        data: sanitizeSupplierInput(req.body),
      });
      res.json(supplier);
    }),
  );

  app.delete(
    "/api/suppliers/:id",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const existingSupplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true },
      });

      if (!existingSupplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const linkedProductsCount = await prisma.product.count({
        where: { supplierId },
      });

      await prisma.$transaction(async (tx) => {
        if (linkedProductsCount > 0) {
          await tx.product.updateMany({
            where: { supplierId },
            data: { supplierId: null },
          });
        }

        await tx.supplier.delete({
          where: { id: supplierId },
        });
      });

      res.json({
        success: true,
        message: linkedProductsCount > 0
          ? `Supplier deleted. ${linkedProductsCount} linked product${linkedProductsCount > 1 ? "s were" : " was"} detached.`
          : `Supplier ${existingSupplier.name} deleted successfully.`,
      });
    }),
  );

  app.get(
    "/api/suppliers/:id/items",
    authenticate,
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });

      if (!supplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const items = await prisma.supplierSupplyItem.findMany({
        where: { supplierId },
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      });

      res.json(items);
    }),
  );

  app.post(
    "/api/suppliers/:id/items",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });

      if (!supplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const payload = sanitizeSupplierSupplyItemInput(req.body);
      const existingItem = await prisma.supplierSupplyItem.findFirst({
        where: {
          supplierId,
          name: {
            equals: payload.name,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (existingItem) {
        throw new ApiError(400, "This item name already exists for the supplier");
      }

      const item = await prisma.$transaction(async (tx) => {
        if (payload.productId) {
          const product = await tx.product.findUnique({
            where: { id: payload.productId },
            select: { id: true, name: true, isService: true, status: true },
          });

          if (!product) {
            throw new ApiError(404, "Inventory item not found");
          }

          if (product.isService) {
            throw new ApiError(400, "POS/service products cannot be linked as supplier inventory items");
          }

          if (product.status !== "ACTIVE") {
            throw new ApiError(400, "Only active inventory items can be linked");
          }

          await tx.product.update({
            where: { id: product.id },
            data: {
              supplierId,
              ...(payload.buyingPrice != null ? { buyingPrice: payload.buyingPrice } : {}),
            },
          });
        } else {
          const unitType = payload.unitType ?? "UNIT";
          const rollLengthFeet = unitType === "ROLL" ? payload.rollLengthFeet ?? null : null;

          if (unitType === "ROLL" && (!rollLengthFeet || rollLengthFeet <= 0)) {
            throw new ApiError(400, "Roll length (feet) is required for roll items");
          }

          const existingProduct = await tx.product.findFirst({
            where: {
              isService: false,
              name: {
                equals: payload.name,
                mode: "insensitive",
              },
            },
            select: { id: true },
          });

          if (existingProduct) {
            await tx.product.update({
              where: { id: existingProduct.id },
              data: {
                supplierId,
                ...(payload.buyingPrice != null ? { buyingPrice: payload.buyingPrice } : {}),
                minimumStockThreshold: payload.minimumStockThreshold,
                ...(unitType === "ROLL" && rollLengthFeet ? { rollLengthFeet } : {}),
              },
            });
          } else {
            const sku = await generateUniqueProductSku(payload.name, tx);
            await tx.product.create({
              data: {
                name: payload.name,
                sku,
                supplierId,
                unitType,
                buyingPrice: payload.buyingPrice ?? 0,
                sellingPrice: 0,
                currentStock: 0,
                minimumStockThreshold: payload.minimumStockThreshold,
                rollLengthFeet,
                isService: false,
                status: "ACTIVE",
              },
            });
          }
        }

        return tx.supplierSupplyItem.create({
          data: {
            id: randomUUID(),
            supplierId,
            name: payload.name,
          },
        });
      });

      res.status(201).json(item);
    }),
  );

  app.delete(
    "/api/suppliers/:id/items/:itemId",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const itemId = asString(req.params.itemId, { field: "Supplier item", min: 1 })!;

      const item = await prisma.supplierSupplyItem.findFirst({
        where: { id: itemId, supplierId },
        select: { id: true, name: true },
      });

      if (!item) {
        throw new ApiError(404, "Supplier item not found");
      }

      await prisma.supplierSupplyItem.delete({
        where: { id: itemId },
      });

      res.json({
        success: true,
        message: `Supplier item ${item.name} deleted successfully.`,
      });
    }),
  );

  app.get(
    "/api/suppliers/:id/history",
    authenticate,
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });

      if (!supplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const records = await prisma.supplierSupplyRecord.findMany({
        where: { supplierId },
        orderBy: [{ suppliedAt: "desc" }, { createdAt: "desc" }],
      });

      res.json(records);
    }),
  );

  app.post(
    "/api/suppliers/:id/history",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const supplierId = asString(req.params.id, { field: "Supplier", min: 1 })!;
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true },
      });

      if (!supplier) {
        throw new ApiError(404, "Supplier not found");
      }

      const recordsPayload = sanitizeSupplierSupplyRecordBatchInput(
        Array.isArray((req.body as any)?.records) ? (req.body as any).records : [req.body],
      );

      const productIds = Array.from(new Set(recordsPayload.map((payload) => payload.productId).filter(Boolean) as string[]));
      const products = productIds.length
        ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              name: true,
              isService: true,
              status: true,
              unitType: true,
              rollLengthFeet: true,
              category: {
                select: { name: true },
              },
            },
          })
        : [];
      const productMap = new Map(products.map((product) => [product.id, product]));

      for (const payload of recordsPayload) {
        if (!payload.productId) {
          continue;
        }

        const product = productMap.get(payload.productId);
        if (!product) {
          throw new ApiError(404, `Inventory item for ${payload.itemName} was not found`);
        }

        if (product.isService) {
          throw new ApiError(400, `${product.name} is a POS/service product and cannot be received here`);
        }

        if (product.status !== "ACTIVE") {
          throw new ApiError(400, `${product.name} is inactive and cannot be restocked`);
        }
      }

      const createdRecords = await prisma.$transaction(async (tx) => {
        const normalizedRecords = recordsPayload.map((payload) => ({
          ...payload,
          itemName: payload.productId ? productMap.get(payload.productId)?.name ?? payload.itemName : payload.itemName,
        }));

        for (const payload of normalizedRecords) {
          const existingItem = await tx.supplierSupplyItem.findFirst({
            where: {
              supplierId,
              name: {
                equals: payload.itemName,
                mode: "insensitive",
              },
            },
            select: { id: true },
          });

          if (!existingItem) {
            await tx.supplierSupplyItem.create({
              data: {
                id: randomUUID(),
                supplierId,
                name: payload.itemName,
              },
            });
          }
        }

        const restockMap = new Map<string, { quantity: number; unitPrice: number; itemName: string }>();
        for (const payload of normalizedRecords) {
          if (!payload.productId) {
            continue;
          }

          const product = productMap.get(payload.productId);
          const isBannerRoll = product?.unitType === "ROLL";
          const stockIncrease =
            isBannerRoll && product?.rollLengthFeet && product.rollLengthFeet > 0
              ? resolveBannerRollFeet(payload.quantity, product.rollLengthFeet, payload.quantity)
              : payload.quantity;

          const current = restockMap.get(payload.productId);
          if (current) {
            current.quantity += stockIncrease;
            current.unitPrice = payload.unitPrice;
            current.itemName = payload.itemName;
          } else {
            restockMap.set(payload.productId, {
              quantity: stockIncrease,
              unitPrice: payload.unitPrice,
              itemName: payload.itemName,
            });
          }
        }

        for (const [productId, restock] of restockMap.entries()) {
          await tx.product.update({
            where: { id: productId },
            data: {
              currentStock: { increment: restock.quantity },
              supplierId,
              buyingPrice: restock.unitPrice,
              lastRestockDate: new Date(),
            },
          });
        }

        if (restockMap.size > 0) {
          await tx.inventoryTransaction.createMany({
            data: normalizedRecords
              .filter((payload) => payload.productId)
              .map((payload) => ({
                productId: payload.productId!,
                transactionType: "STOCK_IN",
                quantity: (() => {
                  const product = productMap.get(payload.productId!);
                  const isBannerRoll = product?.unitType === "ROLL";
                  return isBannerRoll && product?.rollLengthFeet && product.rollLengthFeet > 0
                    ? resolveBannerRollFeet(payload.quantity, product.rollLengthFeet, payload.quantity)
                    : payload.quantity;
                })(),
                performedBy: supplier.name,
                reason: `Supplier record: ${supplier.name} - ${payload.itemName}`,
              })),
          });

          const refreshedProducts = await tx.product.findMany({
            where: { id: { in: Array.from(restockMap.keys()) } },
            select: { id: true, currentStock: true, minimumStockThreshold: true },
          });

          for (const product of refreshedProducts) {
            if (product.currentStock > product.minimumStockThreshold) {
              await tx.stockAlert.updateMany({
                where: { productId: product.id, status: "UNREAD" },
                data: { status: "RESOLVED", resolvedAt: new Date() },
              });
            }
          }
        }

        return Promise.all(
          normalizedRecords.map((payload) =>
            tx.supplierSupplyRecord.create({
              data: {
                id: randomUUID(),
                supplierId,
                itemName: payload.itemName,
                quantity: payload.quantity,
                unitPrice: payload.unitPrice,
                notes: payload.notes ?? null,
                suppliedAt: payload.suppliedAt,
              },
            }),
          ),
        );
      });

      res.status(201).json(createdRecords.length === 1 ? createdRecords[0] : createdRecords);
    }),
  );

  app.get(
    "/api/customers",
    authenticate,
    asyncHandler(async (req, res) => {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const page = getPage(req.query);
      const limit = getLimit(req.query, 20, 100);
      const hasPaginationRequest = typeof req.query.page === "string" || typeof req.query.limit === "string" || Boolean(search);
      const where: Prisma.CustomerWhereInput = search
        ? {
            OR: [
              { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {};

      if (!hasPaginationRequest) {
        const customers = await prisma.customer.findMany({
          where,
          orderBy: { name: "asc" },
        });
        res.json(customers);
        return;
      }

      const totalItems = await prisma.customer.count({ where });
      const totalPages = Math.max(1, Math.ceil(totalItems / limit));
      const safePage = Math.min(page, totalPages);
      const customers = await prisma.customer.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (safePage - 1) * limit,
        take: limit,
      });

      res.json({
        items: customers,
        pagination: {
          page: safePage,
          limit,
          totalItems,
          totalPages,
          hasPreviousPage: safePage > 1,
          hasNextPage: safePage < totalPages,
        },
      });
    }),
  );

  app.post(
    "/api/customers",
    authenticate,
    requireRoles("ADMIN", "CASHIER", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const customer = await prisma.customer.create({
        data: sanitizeCustomerInput(req.body),
      });
      res.status(201).json(customer);
    }),
  );

  app.put(
    "/api/customers/:id",
    authenticate,
    requireRoles("ADMIN", "CASHIER", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const customerId = asString(req.params.id, { field: "Customer", min: 1 })!;
      const existingCustomer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!existingCustomer) {
        throw new ApiError(404, "Customer not found");
      }

      const customer = await prisma.customer.update({
        where: { id: customerId },
        data: sanitizeCustomerInput(req.body),
      });

      res.json(customer);
    }),
  );

  app.get(
    "/api/customers/:id/history",
    authenticate,
    asyncHandler(async (req, res) => {
      const customerId = asString(req.params.id, { field: "Customer", min: 1 })!;
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const page = getPage(req.query);
      const limit = getLimit(req.query, 20, 100);

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, phone: true, email: true, address: true },
      });

      if (!customer) {
        throw new ApiError(404, "Customer not found");
      }

      const where: Prisma.SaleWhereInput = {
        customerId,
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { cashier: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
                { paymentMethod: { contains: search, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : {}),
      };

      const [totalItems, totals, historyItems] = await Promise.all([
        prisma.sale.count({ where }),
        prisma.sale.aggregate({
          where,
          _sum: { total: true },
          _avg: { total: true },
        }),
        prisma.sale.findMany({
          where,
          select: orderListSelect,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalItems / limit));

      res.json({
        customer,
        items: historyItems.map((order) => ({
          ...order,
          itemsCount: order._count.items,
        })),
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },
        summary: {
          totalOrders: totalItems,
          totalRevenue: totals._sum.total ?? 0,
          averageOrderValue: totals._avg.total ?? 0,
        },
      });
    }),
  );

  app.post(
    "/api/inventory/restock",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const productId = asString(req.body?.productId, { field: "Product", min: 1 })!;
      const quantityInput = asNumber(req.body?.quantity, { field: "Quantity", min: 0.01, optional: true });
      const rollCount = asNumber(req.body?.rollCount, { field: "Roll count", min: 0.01, optional: true });
      const legacyRollLengthMeters = asNumber(req.body?.rollLengthMeters, { field: "Roll length (meters)", min: 0.1, optional: true });
      const rollLengthFeet = asNumber(req.body?.rollLengthFeet, { field: "Roll length (feet)", min: 0.1, optional: true })
        ?? (legacyRollLengthMeters ? metersToFeet(legacyRollLengthMeters) : undefined);
      const buyingPrice = asNumber(req.body?.buyingPrice, { field: "Buying price", min: 0, optional: true });
      const supplierId = asString(req.body?.supplierId, { field: "Supplier", optional: true });
      const authUser = (req as AuthenticatedRequest).user;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          currentStock: true,
          categoryId: true,
          minimumStockThreshold: true,
          unitType: true,
          rollLengthFeet: true,
        },
      });

      if (!product) {
        throw new ApiError(404, "Product not found");
      }

      const isBannerCategory = product.unitType === "ROLL";
      const effectiveRollLength = rollLengthFeet ?? product.rollLengthFeet ?? null;
      if (product.unitType === "ROLL" && isBannerCategory && rollCount && rollCount > 0 && (!effectiveRollLength || effectiveRollLength <= 0)) {
        throw new ApiError(400, "Roll length is required for banner roll restocks");
      }
      const quantity =
        product.unitType === "ROLL" && isBannerCategory && rollCount && rollCount > 0
          ? resolveBannerRollFeet(rollCount, effectiveRollLength, 0)
          : quantityInput;

      if (!quantity || quantity <= 0) {
        throw new ApiError(400, "Quantity is required");
      }

      const updatedProduct = await prisma.$transaction(async (tx) => {
        const item = await tx.product.update({
          where: { id: productId },
          data: {
            currentStock: { increment: quantity },
            supplierId,
            lastRestockDate: new Date(),
            ...(product.unitType === "ROLL" && rollLengthFeet && rollLengthFeet > 0 ? { rollLengthFeet } : {}),
            ...(buyingPrice != null ? { buyingPrice } : {}),
          },
          include: productInclude,
        });

        await tx.inventoryTransaction.create({
          data: {
            productId,
            transactionType: "STOCK_IN",
            quantity,
            performedBy: authUser.name,
            reason: getRestockReason(product, isBannerCategory, rollLengthFeet),
          },
        });

        if (item.currentStock > item.minimumStockThreshold) {
          await tx.stockAlert.updateMany({
            where: { productId, status: "UNREAD" },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });
        }

        await recordAuditLog(tx, authUser.id, "inventory", "RESTOCK_PRODUCT", `Restocked ${item.name} by ${quantity}`);
        return item;
      });

      res.json(updatedProduct);
    }),
  );

  app.post(
    "/api/inventory/adjust",
    authenticate,
    requireRoles("ADMIN", "INVENTORY_MANAGER"),
    asyncHandler(async (req, res) => {
      const authUser = (req as AuthenticatedRequest).user;
      const productId = asString(req.body?.productId, { field: "Product", min: 1 })!;
      const direction = asString(req.body?.direction, { field: "Direction", min: 2 })!.toUpperCase();
      const quantity = asNumber(req.body?.quantity, { field: "Quantity", min: 0.0001 })!;
      const reason = asString(req.body?.reason, { field: "Reason", min: 2, max: 240 })!;

      if (direction !== "IN" && direction !== "OUT") {
        throw new ApiError(400, "Direction must be IN (add stock) or OUT (reduce stock)");
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, currentStock: true, minimumStockThreshold: true, unitType: true },
      });

      if (!product) {
        throw new ApiError(404, "Product not found");
      }

      const delta = direction === "IN" ? quantity : -quantity;
      const nextStock = Number((product.currentStock + delta).toFixed(4));
      if (nextStock < -0.000001) {
        throw new ApiError(
          400,
          `Cannot reduce ${product.name} by ${quantity.toFixed(2)}; only ${product.currentStock.toFixed(2)} in stock.`,
        );
      }

      const updatedProduct = await prisma.$transaction(async (tx) => {
        const item = await tx.product.update({
          where: { id: productId },
          data: {
            currentStock: Math.max(0, nextStock),
            ...(direction === "IN" ? { lastRestockDate: new Date() } : {}),
          },
          include: productInclude,
        });

        await tx.inventoryTransaction.create({
          data: {
            productId,
            transactionType: direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantity,
            performedBy: authUser.name,
            reason,
          },
        });

        if (item.currentStock <= item.minimumStockThreshold) {
          const existingAlert = await tx.stockAlert.findFirst({
            where: { productId, status: "UNREAD" },
            select: { id: true },
          });
          if (!existingAlert) {
            await tx.stockAlert.create({
              data: {
                productId,
                currentStock: item.currentStock,
                thresholdValue: item.minimumStockThreshold,
              },
            });
          }
        } else {
          await tx.stockAlert.updateMany({
            where: { productId, status: "UNREAD" },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });
        }

        await recordAuditLog(
          tx,
          authUser.id,
          "inventory",
          "ADJUST_STOCK",
          `Adjusted ${item.name} ${direction === "IN" ? "+" : "-"}${quantity} (${reason})`,
        );
        return item;
      });

      res.json(updatedProduct);
    }),
  );

  app.get(
    "/api/reports/sales",
    authenticate,
    asyncHandler(async (req, res) => {
      const { start, end } = getDateRange(req.query);
      const sales = await prisma.sale.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  unitType: true,
                },
              },
            },
          },
          customer: {
            select: { id: true, name: true },
          },
          cashier: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: getLimit(req.query, 100, 500),
      });

      res.json(sales);
    }),
  );

  app.get(
    "/api/reports/material-usage",
    authenticate,
    asyncHandler(async (req, res) => {
      const { start, end } = getDateRange(req.query);
      const usage = await prisma.inventoryTransaction.findMany({
        where: {
          transactionType: { in: ["SALE_OUT", "WASTAGE"] },
          ...(buildDateRangeFilter(start, end) ? { createdAt: buildDateRangeFilter(start, end) } : {}),
        },
        include: {
          product: {
            select: { id: true, name: true, unitType: true, buyingPrice: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: getLimit(req.query, 100, 500),
      });

      res.json(usage);
    }),
  );

  app.get(
    "/api/reports/profit",
    authenticate,
    asyncHandler(async (req, res) => {
      const { start, end } = getDateRange(req.query);
      const sales = await prisma.sale.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          items: {
            select: {
              quantity: true,
              buyingPrice: true,
              designerCost: true,
              total: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: getLimit(req.query, 365, 1000),
      });

      const grouped = new Map<
        string,
        { date: string; revenue: number; cost: number; profit: number; salesCount: number }
      >();

      for (const sale of sales) {
        const dayKey = formatDayKey(sale.createdAt);
        const bucket =
          grouped.get(dayKey) ??
          { date: dayKey, revenue: 0, cost: 0, profit: 0, salesCount: 0 };

        const cost = calculateSaleCost(sale.items);

        bucket.revenue += sale.total;
        bucket.cost += cost;
        bucket.profit += sale.total - cost;
        bucket.salesCount += 1;

        grouped.set(dayKey, bucket);
      }

      res.json(
        Array.from(grouped.values()).map((entry) => ({
          ...entry,
          revenue: Number(entry.revenue.toFixed(2)),
          cost: Number(entry.cost.toFixed(2)),
          profit: Number(entry.profit.toFixed(2)),
        })),
      );
    }),
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const prismaError = error as { code?: string } | undefined;
    if (prismaError?.code === "P2002") {
        return res.status(409).json({ error: "A record with this value already exists" });
    }
    if (prismaError?.code === "P2025") {
        return res.status(404).json({ error: "Requested record was not found" });
    }

    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
