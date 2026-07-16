import { defaultShopProfile, type ShopProfile } from "./shop-profile";
import { apiFetch } from "./utils";

export type OrderListEntry = {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balance: number;
  paymentMethod: string;
  createdAt: string;
  itemsCount: number;
  customer?: {
    id: string;
    name: string;
  } | null;
  cashier: {
    id: string;
    name: string;
  };
};

export type OrderCustomerFilter = "ALL" | "REGISTERED" | "WALK_IN";

export type OrderListResponse = {
  items: OrderListEntry[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
  };
};

export type OrderInvoiceItem = {
  id: string;
  quantity: number;
  width?: number | null;
  height?: number | null;
  designerCost?: number | null;
  buyingPrice: number;
  sellingPrice: number;
  discount: number;
  total: number;
  product: {
    id: string;
    name: string;
    sku: string;
    unitType: string;
  };
};

export type OrderInvoice = {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balance: number;
  paymentMethod: string;
  createdAt: string;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  cashier: {
    id: string;
    name: string;
    email?: string | null;
  };
  items: OrderInvoiceItem[];
};

export function formatInvoiceQuantity(item: OrderInvoiceItem) {
  const quantity = Number(item.quantity || 0);
  const formattedQuantity = Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(2);
  return `${formattedQuantity} ${item.product.unitType}`;
}

export function formatCurrency(value: number) {
  return `LKR ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getInvoiceItemActualPrice(item: OrderInvoiceItem) {
  return item.quantity * item.sellingPrice + (item.designerCost ?? 0);
}

export function getInvoiceItemFinalPrice(item: OrderInvoiceItem) {
  return getInvoiceItemActualPrice(item) - item.discount;
}

export function getInvoiceLineDiscountTotal(order: OrderInvoice) {
  return order.items.reduce((sum, item) => sum + item.discount, 0);
}

export function getInvoiceActualSubtotal(order: OrderInvoice) {
  return order.items.reduce((sum, item) => sum + getInvoiceItemActualPrice(item), 0);
}

export function getInvoiceTotalDiscount(order: OrderInvoice) {
  return getInvoiceLineDiscountTotal(order) + order.discount;
}

export function getInvoiceDueAmount(order: Pick<OrderInvoice, "total" | "paidAmount">) {
  return Math.max(0, Number((order.total - order.paidAmount).toFixed(2)));
}

export function getInvoiceChangeAmount(order: Pick<OrderInvoice, "total" | "paidAmount">) {
  return Math.max(0, Number((order.paidAmount - order.total).toFixed(2)));
}

export function getInvoiceLineSummary(item: OrderInvoiceItem) {
  if (item.width && item.height) {
    return `${item.width}ft x ${item.height}ft`;
  }

  return formatInvoiceQuantity(item);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildInvoiceMarkup(order: OrderInvoice, shopProfile: ShopProfile) {
  const actualSubtotal = getInvoiceActualSubtotal(order);
  const totalDiscount = getInvoiceTotalDiscount(order);
  const dueAmount = getInvoiceDueAmount(order);
  const changeAmount = getInvoiceChangeAmount(order);

  const rowsMarkup = order.items
    .map((item, index) => {
      const finalPrice = getInvoiceItemFinalPrice(item);
      const size = item.width && item.height ? `${item.width}ft × ${item.height}ft` : "";
      const metaParts = [item.product.sku, size, item.designerCost ? `Service: ${formatCurrency(item.designerCost)}` : ""].filter(Boolean);
      const metaLine = metaParts.length ? `<div class="desc-meta">${escapeHtml(metaParts.join(" • "))}</div>` : "";
      const lineDiscount = item.discount > 0 ? `<div class="desc-meta discount">Discount: - ${escapeHtml(formatCurrency(item.discount))}</div>` : "";
      return `
        <tr>
          <td class="c-no">${index + 1}</td>
          <td class="c-desc">
            <div class="desc-name">${escapeHtml(item.product.name)}</div>
            ${metaLine}
            ${lineDiscount}
          </td>
          <td class="c-num">${escapeHtml(formatCurrency(item.sellingPrice))}</td>
          <td class="c-num">${escapeHtml(formatInvoiceQuantity(item))}</td>
          <td class="c-num strong">${escapeHtml(formatCurrency(finalPrice))}</td>
        </tr>
      `;
    })
    .join("");

  // Per-letter brand colors sampled from the adzone wordmark (a=red, d=orange, z=magenta, o=amber, n=pink, e=orange).
  const brandLetterColors = ["#e63558", "#f06d2a", "#c94f9e", "#f6a523", "#ee5fa7", "#f17e2d"];
  let brandLetterIndex = 0;
  const brandMarkup = shopProfile.shopName
    .split("")
    .map((char) => {
      if (!char.trim()) {
        return char;
      }
      const color = brandLetterColors[brandLetterIndex % brandLetterColors.length];
      brandLetterIndex += 1;
      return `<span style="color:${color}">${escapeHtml(char)}</span>`;
    })
    .join("");

  const customerName = order.customer?.name || "Walk-in Customer";
  const customerLines = [order.customer?.address, order.customer?.phone, order.customer?.email]
    .filter(Boolean)
    .map((line) => `<div class="bill-to-line">${escapeHtml(String(line))}</div>`)
    .join("");

  const iconPhone = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M13.4 5.8c1.1-.6 2.5-.3 3.2.7l5.2 7.3c.7 1 .6 2.3-.2 3.2l-3.7 4.1c2.5 5.2 5.7 8.5 10.9 11l4.2-3.8c.9-.8 2.2-.9 3.2-.2l7.3 5.2c1 .7 1.3 2.1.7 3.2l-2.4 4.3c-.7 1.2-2 1.9-3.4 1.8C20.8 41.1 6.9 27.2 5.4 9.6c-.1-1.4.6-2.7 1.8-3.4l6.2-3.4v3z"/><path d="M30.8 7.5c5.1 1.5 8.2 4.6 9.7 9.7M29.4 14c2.4.8 3.8 2.2 4.6 4.6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`;
  const iconPin = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M24 3.5c-8.3 0-15 6.7-15 15 0 10.9 15 23.8 15 23.8s15-12.9 15-23.8c0-8.3-6.7-15-15-15zm0 21.1a6.1 6.1 0 1 1 0-12.2 6.1 6.1 0 0 1 0 12.2z"/><path d="M13.5 40.4c-3.2.8-5.2 2-5.2 3.3 0 2.3 7 4.3 15.7 4.3s15.7-2 15.7-4.3c0-1.3-2-2.5-5.2-3.3-1.1 1.2-2.1 2.2-3 3 2.2.3 3.6.8 3.6 1.2 0 .8-5 1.5-11.1 1.5s-11.1-.7-11.1-1.5c0-.4 1.4-.9 3.6-1.2-.9-.8-1.9-1.8-3-3z" fill="currentColor"/></svg>`;
  const iconMail = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M5 9h38a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z"/><path d="m4.5 12 19.5 14L43.5 12M4.5 36l13.2-13M43.5 36 30.3 23" fill="none" stroke="#292929" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const footerPhone = shopProfile.phone?.trim() || defaultShopProfile.phone!;
  const footerAddress = shopProfile.address?.trim() || defaultShopProfile.address!;
  const footerEmail = shopProfile.email?.trim() || defaultShopProfile.email!;
  const footerCells = [
    `<div class="foot-cell">${iconPhone}<div class="foot-text"><div class="foot-label">PHONE</div><div class="foot-value">${escapeHtml(footerPhone)}</div></div></div>`,
    `<div class="foot-cell">${iconPin}<div class="foot-text"><div class="foot-label">ADDRESS</div><div class="foot-value">${escapeHtml(footerAddress)}</div></div></div>`,
    `<div class="foot-cell">${iconMail}<div class="foot-text"><div class="foot-label">EMAIL</div><div class="foot-value">${escapeHtml(footerEmail)}</div></div></div>`,
  ].join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(order.invoiceNumber)}</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          @page { size: B5 portrait; margin: 0; }
          body {
            margin: 0;
            padding: 0 12px 16px;
            background: #e9eaec;
            color: #1f2937;
            font-family: "Helvetica Neue", Arial, sans-serif;
            font-size: 12px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .sheet {
            width: 176mm;
            min-height: 250mm;
            margin: 0 auto;
            background: #fff;
            box-shadow: 0 10px 40px rgba(0,0,0,.18);
            display: flex;
            flex-direction: column;
          }
          .pad { padding: 0 16mm; }
          /* Header band — dark charcoal with a diagonal cut: shallow on the left, deep on the right */
          .band-top {
            background: #26292f;
            color: #fff;
            padding: 9mm 16mm 16mm;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            clip-path: polygon(0 0, 100% 0, 100% 100%, 57% 100%, 46.5% 56%, 0 56%);
          }
          .band-top .left { display: flex; align-items: center; gap: 12px; padding-top: 2mm; }
          .logo { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background:#fff; }
          .tagline { font-size: 13px; letter-spacing: .3em; text-transform: uppercase; color: #f3f4f6; font-weight: 700; }
          .brand-block { text-align: right; }
          .word-invoice {
            font-size: 36px; font-weight: 600; letter-spacing: .01em; line-height: 1;
            font-family: "Segoe UI", "Trebuchet MS", "Helvetica Neue", Arial, sans-serif;
            color: #f4f5f7;
          }
          .brand {
            font-size: 46px; font-weight: 800; letter-spacing: -.02em; line-height: .9;
            text-transform: lowercase; margin-top: 1px;
            font-family: "Segoe UI", "Trebuchet MS", "Helvetica Neue", Arial, sans-serif;
          }
          /* Meta */
          .meta { display: flex; justify-content: space-between; gap: 24px; padding-top: 10mm; }
          .meta-rows .row { display: flex; gap: 8px; }
          .meta-rows .k { width: 130px; color: #6b7280; font-weight: 700; }
          .bill-to { margin-top: 8mm; }
          .bill-to-title { color: #6b7280; font-weight: 700; letter-spacing: .08em; font-size: 11px; }
          .bill-to-name { font-size: 18px; font-weight: 800; margin-top: 4px; }
          .bill-to-line { color: #4b5563; font-size: 12px; }
          /* Table */
          table { width: 100%; border-collapse: collapse; margin-top: 9mm; }
          thead th {
            background: #2c3038; color: #fff; font-size: 11px; letter-spacing: .08em;
            text-transform: uppercase; font-weight: 700; padding: 10px 12px; text-align: left;
          }
          thead th.r { text-align: right; }
          tbody td { padding: 11px 12px; border-bottom: 1px solid #eceef1; vertical-align: top; }
          tbody tr:nth-child(even) td { background: #f7f8f9; }
          .c-no { width: 40px; color: #9ca3af; font-weight: 700; }
          .c-num { text-align: right; white-space: nowrap; }
          .c-num.strong { font-weight: 700; }
          .desc-name { font-weight: 700; color: #111827; }
          .desc-meta { color: #6b7280; font-size: 11px; margin-top: 2px; }
          .desc-meta.discount { color: #dc2626; }
          /* Totals */
          .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8mm; }
          .totals { width: 80mm; }
          .totals .trow { display: flex; justify-content: space-between; padding: 7px 12px; font-size: 13px; }
          .totals .trow .lbl { color: #6b7280; }
          .totals .trow.muted .val { color: #111827; font-weight: 600; }
          .totals .trow.discount .val { color: #dc2626; font-weight: 600; }
          .totals .grand {
            display: flex; justify-content: space-between; align-items: center;
            background: #2c3038; color: #fff; padding: 12px 14px; border-radius: 8px; margin-top: 6px;
          }
          .totals .grand .lbl { font-weight: 700; letter-spacing: .04em; }
          .totals .grand .val { font-size: 20px; font-weight: 800; }
          .totals .pill { display:flex; justify-content: space-between; padding: 8px 12px; border-radius: 8px; margin-top: 6px; font-weight: 700; }
          .pill.due { background: #fef2f2; color: #b91c1c; }
          .pill.change { background: #ecfdf5; color: #047857; }
          /* Payment note */
          .pay-sign { margin-top: 10mm; }
          .pay-title { font-weight: 800; letter-spacing: .04em; }
          .pay-note { color: #6b7280; font-size: 12px; margin-top: 2px; }
          .note { margin-top: 8mm; color: #6b7280; font-size: 11px; border-top: 1px dashed #d1d5db; padding-top: 6px; }
          .spacer { flex: 1; }
          /* Footer band: dark contact strip styled after the supplied receipt reference. */
          .band-bottom {
            margin-top: 10mm;
            min-height: 32mm;
            padding: 7.5mm 12mm;
            background: #292929;
            color: #d9a06f;
            display: grid;
            grid-template-columns: .95fr 1.2fr 1fr;
            align-items: center;
            column-gap: 6mm;
          }
          .foot-cell { display: flex; align-items: center; gap: 3.5mm; min-width: 0; }
          .foot-cell svg { width: 10.5mm; height: 10.5mm; color: #e2a66f; flex: none; }
          .foot-text { min-width: 0; }
          .foot-label {
            color: #f0ece8;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.2;
            letter-spacing: .25em;
            text-transform: uppercase;
          }
          .foot-value {
            margin-top: 2mm;
            color: #d3cfcb;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.4;
            letter-spacing: .01em;
            overflow-wrap: anywhere;
          }
          @media print {
            body { background: #fff; padding: 0; }
            .sheet { width: 176mm; min-height: 250mm; margin: 0; box-shadow: none; }
            .band-top, .pad { padding-left: 14mm; padding-right: 14mm; }
            .band-bottom { padding-left: 12mm; padding-right: 12mm; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="band-top">
            <div class="left">
              ${shopProfile.logoUrl ? `<img class="logo" src="${escapeHtml(shopProfile.logoUrl)}" alt="${escapeHtml(shopProfile.shopName)} logo" />` : ""}
              <div class="tagline">${escapeHtml(shopProfile.tagline || "Printing Industries")}</div>
            </div>
            <div class="brand-block">
              <div class="word-invoice">invoice</div>
              <div class="brand">${brandMarkup}</div>
            </div>
          </div>

          <div class="pad">
            <div class="meta">
              <div class="meta-rows">
                <div class="row"><span class="k">Invoice Number</span><span>: ${escapeHtml(order.invoiceNumber)}</span></div>
                <div class="row"><span class="k">Date</span><span>: ${escapeHtml(new Date(order.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }))}</span></div>
                <div class="bill-to">
                  <div class="bill-to-title">INVOICE TO :</div>
                  <div class="bill-to-name">${escapeHtml(customerName)}</div>
                  ${customerLines}
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Description</th>
                  <th class="r">Price</th>
                  <th class="r">Qty</th>
                  <th class="r">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rowsMarkup}
              </tbody>
            </table>

            <div class="totals-wrap">
              <div class="totals">
                <div class="trow muted"><span class="lbl">Subtotal</span><span class="val">${escapeHtml(formatCurrency(actualSubtotal))}</span></div>
                ${totalDiscount > 0 ? `<div class="trow discount"><span class="lbl">Discount</span><span class="val">- ${escapeHtml(formatCurrency(totalDiscount))}</span></div>` : ""}
                <div class="grand"><span class="lbl">Total</span><span class="val">${escapeHtml(formatCurrency(order.total))}</span></div>
                <div class="trow muted"><span class="lbl">Paid</span><span class="val">${escapeHtml(formatCurrency(order.paidAmount))}</span></div>
                ${dueAmount > 0 ? `<div class="pill due"><span>Balance Due</span><span>${escapeHtml(formatCurrency(dueAmount))}</span></div>` : ""}
                ${changeAmount > 0 ? `<div class="pill change"><span>Change</span><span>${escapeHtml(formatCurrency(changeAmount))}</span></div>` : ""}
              </div>
            </div>

            <div class="pay-sign">
              <div>
                <div class="pay-title">${escapeHtml(order.paymentMethod)} PAYMENT</div>
                <div class="pay-note">Thank you for your business.</div>
              </div>
            </div>

            ${shopProfile.invoiceFooter ? `<div class="note">${escapeHtml(shopProfile.invoiceFooter)}</div>` : ""}
          </div>

          <div class="spacer"></div>

          <div class="band-bottom">${footerCells}</div>
        </div>
      </body>
    </html>
  `;
}

export async function printOrderInvoice(order: OrderInvoice, shopProfile: ShopProfile) {
  if (shopProfile.printerName) {
    await apiFetch("/print/invoice", {
      method: "POST",
      body: JSON.stringify({ markup: buildInvoiceMarkup(order, shopProfile) }),
    });
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=1040");
  if (!printWindow) {
    throw new Error("Allow popups to print the invoice");
  }

  printWindow.document.open();
  printWindow.document.write(buildInvoiceMarkup(order, shopProfile));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
