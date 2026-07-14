import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";

type Recipient = {
  name: string;
  email: string;
};

type InventoryReductionEntry = {
  name: string;
  quantity: number;
  wastageQuantity?: number;
  unitType: string;
  previousStock: number;
  remainingStock: number;
  minimumStockThreshold: number;
  sourceProducts: string[];
};

type InventoryReductionNotification = {
  recipients: Recipient[];
  sale: {
    invoiceNumber: string;
    total: number;
    createdAt: Date;
    customerName?: string | null;
    cashierName: string;
  };
  reductions: InventoryReductionEntry[];
};

let transporter: Transporter | null = null;

function getTransporter() {
  if (!config.notifications.smtp.enabled) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.notifications.smtp.host,
      port: config.notifications.smtp.port,
      secure: config.notifications.smtp.secure,
      auth: {
        user: config.notifications.smtp.user,
        pass: config.notifications.smtp.pass,
      },
    });
  }

  return transporter;
}

function formatReductionLine(entry: InventoryReductionEntry) {
  const linkedSources = entry.sourceProducts.length ? ` | Services: ${entry.sourceProducts.join(", ")}` : "";
  const wastageSuffix = entry.wastageQuantity && entry.wastageQuantity > 0 ? ` | Wastage ${entry.wastageQuantity.toFixed(2)} ${entry.unitType}` : "";
  return `${entry.name}: -${entry.quantity.toFixed(2)} ${entry.unitType}${wastageSuffix} | Stock ${entry.previousStock.toFixed(2)} -> ${entry.remainingStock.toFixed(2)} ${entry.unitType} | Threshold ${entry.minimumStockThreshold.toFixed(2)} ${entry.unitType}${linkedSources}`;
}

export function getNotificationMailStatus() {
  return {
    enabled: config.notifications.smtp.enabled,
    from: config.notifications.smtp.from ?? null,
    host: config.notifications.smtp.host ?? null,
  };
}

export async function sendInventoryReductionNotification(payload: InventoryReductionNotification) {
  const mailer = getTransporter();
  if (!mailer || !payload.recipients.length || !config.notifications.smtp.from) {
    return { delivered: false, skipped: true };
  }

  const subject = `Low stock alert after ${payload.sale.invoiceNumber}`;
  const reductionsText = payload.reductions.map((entry) => `- ${formatReductionLine(entry)}`).join("\n");
  const reductionsHtml = payload.reductions
    .map((entry) => `<li style="margin:0 0 8px;">${formatReductionLine(entry)}</li>`)
    .join("");

  await mailer.sendMail({
    from: config.notifications.smtp.from,
    to: payload.recipients.map((recipient) => `${recipient.name} <${recipient.email}>`).join(", "),
    subject,
    text: [
      `Invoice: ${payload.sale.invoiceNumber}`,
      `Cashier: ${payload.sale.cashierName}`,
      `Customer: ${payload.sale.customerName ?? "Walk-in Customer"}`,
      `Total: LKR ${payload.sale.total.toFixed(2)}`,
      `Created: ${payload.sale.createdAt.toLocaleString()}`,
      "",
      "Products that reached low stock threshold:",
      reductionsText,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b;">
        <h2 style="margin:0 0 12px;">Low Stock Threshold Alert</h2>
        <p style="margin:0 0 8px;"><strong>Invoice:</strong> ${payload.sale.invoiceNumber}</p>
        <p style="margin:0 0 8px;"><strong>Cashier:</strong> ${payload.sale.cashierName}</p>
        <p style="margin:0 0 8px;"><strong>Customer:</strong> ${payload.sale.customerName ?? "Walk-in Customer"}</p>
        <p style="margin:0 0 8px;"><strong>Total:</strong> LKR ${payload.sale.total.toFixed(2)}</p>
        <p style="margin:0 0 16px;"><strong>Created:</strong> ${payload.sale.createdAt.toLocaleString()}</p>
        <p style="margin:0 0 8px;"><strong>Products that reached low stock threshold</strong></p>
        <ul style="padding-left:18px;margin:0;">
          ${reductionsHtml}
        </ul>
      </div>
    `,
  });

  return { delivered: true, skipped: false };
}
