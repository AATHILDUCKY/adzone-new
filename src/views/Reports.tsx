import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, cn } from "../lib/utils";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Check,
  DollarSign,
  Download,
  Filter,
  Package,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ReportPreset = "daily" | "weekly" | "all_time" | "custom_range" | "particular_date";

type SaleItem = {
  id: string;
  quantity: number;
  wastage?: number;
  buyingPrice: number;
  sellingPrice: number;
  designerCost?: number | null;
  discount: number;
  total: number;
  product?: {
    id: string;
    name: string;
    sku: string;
    unitType: string;
  } | null;
};

type SaleRecord = {
  id: string;
  invoiceNumber: string;
  total: number;
  discount: number;
  paymentMethod: string;
  createdAt: string;
  customer?: {
    id: string;
    name: string;
  } | null;
  cashier?: {
    id: string;
    name: string;
  } | null;
  items: SaleItem[];
};

type UsageRecord = {
  id: string;
  referenceId?: string | null;
  quantity: number;
  transactionType: "SALE_OUT" | "WASTAGE";
  reason: string;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    unitType: string;
    buyingPrice: number;
  } | null;
};

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return `LKR ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCompactNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function getDateRangeForPreset(
  preset: ReportPreset,
  particularDate: string,
  customStart: string,
  customEnd: string,
) {
  const today = new Date();

  if (preset === "daily") {
    return {
      start: startOfDay(today),
      end: endOfDay(today),
      label: "Daily report",
    };
  }

  if (preset === "weekly") {
    return {
      start: startOfDay(addDays(today, -6)),
      end: endOfDay(today),
      label: "Weekly report",
    };
  }

  if (preset === "particular_date") {
    const date = particularDate ? new Date(particularDate) : today;
    return {
      start: startOfDay(date),
      end: endOfDay(date),
      label: `Report for ${startOfDay(date).toLocaleDateString()}`,
    };
  }

  if (preset === "custom_range") {
    const startCandidate = customStart ? startOfDay(new Date(customStart)) : startOfDay(today);
    const endCandidate = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(today);
    const start = startCandidate <= endCandidate ? startCandidate : startOfDay(endCandidate);
    const end = startCandidate <= endCandidate ? endCandidate : endOfDay(startCandidate);

    return {
      start,
      end,
      label: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
    };
  }

  return {
    start: undefined,
    end: undefined,
    label: "All time report",
  };
}

function buildReportQuery(start?: Date, end?: Date, limit?: number) {
  const params = new URLSearchParams();

  if (start) {
    params.set("start", start.toISOString());
  }

  if (end) {
    params.set("end", end.toISOString());
  }

  if (limit) {
    params.set("limit", String(limit));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildCsvValue(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function buildExportFileName(base: string, extension: string) {
  return `${base}-${formatInputDate(new Date())}.${extension}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string | number) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function joinRowsAsCsv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map((value) => buildCsvValue(value)).join(",")).join("\n");
}

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function trimPdfCellText(value: string | number, maxLength: number) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildPdfFile(objects: string[]) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((content, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${objects.length} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

function buildReportPdf(summaryRows: Array<Array<string | number>>, tableRows: Array<Array<string | number>>, reportLabel: string) {
  const pageWidth = 842;
  const pageHeight = 595;
  const marginLeft = 28;
  const marginRight = 28;
  const topMargin = 28;
  const bottomMargin = 28;
  const rowHeight = 18;
  const headerHeight = 20;
  const usableWidth = pageWidth - marginLeft - marginRight;
  const firstPageTableTopY = 405;
  const continuedPageTableTopY = 520;
  const tableBottomY = bottomMargin + 10;
  const columnWidths = [72, 80, 100, 78, 62, 34, 62, 62, 58, 62];
  const columnStarts = columnWidths.reduce<number[]>((positions, width, index) => {
    if (index === 0) {
      positions.push(marginLeft);
    } else {
      positions.push(positions[index - 1] + columnWidths[index - 1]);
    }
    return positions;
  }, []);
  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const fontObjectId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjectIds: number[] = [];

  let remainingRows = tableRows.slice(1);
  let pageIndex = 0;

  while (remainingRows.length > 0 || pageIndex === 0) {
    const isFirstPage = pageIndex === 0;
    const tableTopY = isFirstPage ? firstPageTableTopY : continuedPageTableTopY;
    const maxBodyRows = Math.max(1, Math.floor((tableTopY - tableBottomY - headerHeight) / rowHeight));
    const rows = remainingRows.slice(0, maxBodyRows);
    remainingRows = remainingRows.slice(maxBodyRows);

    const streamLines = [
      "0.2 w",
      "BT",
      "/F1 15 Tf",
      `1 0 0 1 ${marginLeft} ${pageHeight - topMargin - 6} Tm (Adzone Business Report) Tj`,
      "/F1 9 Tf",
      `1 0 0 1 ${marginLeft} ${pageHeight - topMargin - 24} Tm (${escapePdfText(`Report Window: ${reportLabel}`)}) Tj`,
      `1 0 0 1 ${marginLeft} ${pageHeight - topMargin - 38} Tm (${escapePdfText(`Generated At: ${new Date().toLocaleString()}`)}) Tj`,
    ];

    if (isFirstPage) {
      const summaryStartY = pageHeight - topMargin - 65;
      summaryRows.slice(1).forEach(([label, value], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = marginLeft + column * 250;
        const y = summaryStartY - row * 16;
        streamLines.push(`1 0 0 1 ${x} ${y} Tm (${escapePdfText(`${label}: ${value}`)}) Tj`);
      });
    } else {
      streamLines.push(`1 0 0 1 ${pageWidth - marginRight - 145} ${pageHeight - topMargin - 24} Tm (Continued table view) Tj`);
    }

    streamLines.push("ET");

    const headerTopY = tableTopY;
    const headerBottomY = headerTopY - headerHeight;
    const tableRightX = marginLeft + usableWidth;

    streamLines.push(`${marginLeft} ${headerTopY} m ${tableRightX} ${headerTopY} l S`);
    streamLines.push(`${marginLeft} ${headerBottomY} m ${tableRightX} ${headerBottomY} l S`);

    const pageRows = [tableRows[0], ...rows];
    pageRows.forEach((row, rowIndex) => {
      const topY = headerBottomY - rowIndex * rowHeight;
      const bottomY = topY - rowHeight;
      streamLines.push(`${marginLeft} ${bottomY} m ${tableRightX} ${bottomY} l S`);

      row.forEach((cell, columnIndex) => {
        const x = columnStarts[columnIndex];
        const nextX = columnIndex === columnWidths.length - 1 ? tableRightX : columnStarts[columnIndex + 1];
        if (rowIndex === 0) {
          streamLines.push(`${x} ${headerTopY} m ${x} ${bottomY} l S`);
          if (columnIndex === columnWidths.length - 1) {
            streamLines.push(`${nextX} ${headerTopY} m ${nextX} ${bottomY} l S`);
          }
        } else {
          streamLines.push(`${x} ${topY} m ${x} ${bottomY} l S`);
          if (columnIndex === columnWidths.length - 1) {
            streamLines.push(`${nextX} ${topY} m ${nextX} ${bottomY} l S`);
          }
        }

        const textX = x + 3;
        const textY = topY - 12;
        const maxLength = Math.max(4, Math.floor(columnWidths[columnIndex] / 6));
        const displayValue = trimPdfCellText(cell, maxLength);
        streamLines.push("BT");
        streamLines.push(`/F1 ${rowIndex === 0 ? 7.5 : 7} Tf`);
        streamLines.push(`1 0 0 1 ${textX} ${textY} Tm (${escapePdfText(displayValue)}) Tj`);
        streamLines.push("ET");
      });
    });

    const footerY = bottomMargin - 2;
    streamLines.push("BT");
    streamLines.push("/F1 8 Tf");
    streamLines.push(`1 0 0 1 ${pageWidth - marginRight - 70} ${footerY} Tm (${escapePdfText(`Page ${pageIndex + 1}`)}) Tj`);
    streamLines.push("ET");

    if (!rows.length) {
      streamLines.push("BT");
      streamLines.push("/F1 9 Tf");
      streamLines.push(`1 0 0 1 ${marginLeft + 4} ${headerBottomY - 14} Tm (No order rows available for the selected filters.) Tj`);
      streamLines.push("ET");
    }

    const streamContent = streamLines.join("\n");
    const contentObjectId = addObject(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);
    const pageObjectId = addObject(
      `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    pageObjectIds.push(pageObjectId);
    pageIndex += 1;
  }

  const kidsRefs = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  const pagesObjectId = addObject(`<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageObjectIds.length} >>`);

  pageObjectIds.forEach((id) => {
    objects[id - 1] = objects[id - 1].replace("PAGES_REF", `${pagesObjectId} 0 R`);
  });

  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);
  return buildPdfFile(objects);
}

function getSaleItemCost(item: Pick<SaleItem, "quantity" | "wastage" | "buyingPrice" | "designerCost">) {
  return item.buyingPrice * (item.quantity + (item.wastage || 0)) + (item.designerCost ?? 0);
}

function getSaleCost(sale: Pick<SaleRecord, "items">, wastageCost: number = 0) {
  return sale.items.reduce((sum, item) => sum + getSaleItemCost(item), 0) + wastageCost;
}

function getSaleProfit(sale: Pick<SaleRecord, "items" | "total">, wastageCost: number = 0) {
  return sale.total - getSaleCost(sale, wastageCost);
}

function getMarginPercent(revenue: number, profit: number) {
  if (revenue <= 0) {
    return 0;
  }

  return (profit / revenue) * 100;
}

export default function Reports() {
  const today = formatInputDate(new Date());
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [usageData, setUsageData] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportPreset, setReportPreset] = useState<ReportPreset>("weekly");
  const [particularDate, setParticularDate] = useState(today);
  const [customStart, setCustomStart] = useState(formatInputDate(addDays(new Date(), -29)));
  const [customEnd, setCustomEnd] = useState(today);
  const [orderSearch, setOrderSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [customerFilter, setCustomerFilter] = useState("ALL");
  const [usageFilter, setUsageFilter] = useState("ALL");
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const activeRange = useMemo(
    () => getDateRangeForPreset(reportPreset, particularDate, customStart, customEnd),
    [reportPreset, particularDate, customStart, customEnd],
  );

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);

      try {
        const salesQuery = buildReportQuery(activeRange.start, activeRange.end, 500);
        const usageQuery = buildReportQuery(activeRange.start, activeRange.end, 250);
        const [sales, usage] = await Promise.all([
          apiFetch(`/reports/sales${salesQuery}`),
          apiFetch(`/reports/material-usage${usageQuery}`),
        ]);

        setSalesData(sales);
        setUsageData(usage);
      } catch (error: any) {
        toast.error(error.message || "Failed to load reports");
      } finally {
        setLoading(false);
      }
    };

    void loadReports();
  }, [activeRange.end, activeRange.start]);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isExportMenuOpen]);

  const normalizedSearch = orderSearch.trim().toLowerCase();

  const filteredSales = salesData.filter((sale) => {
    const matchesPayment = paymentFilter === "ALL" || sale.paymentMethod === paymentFilter;
    const matchesCustomer =
      customerFilter === "ALL" ||
      (customerFilter === "REGISTERED" && Boolean(sale.customer)) ||
      (customerFilter === "WALK_IN" && !sale.customer);
    const matchesSearch =
      !normalizedSearch ||
      sale.invoiceNumber.toLowerCase().includes(normalizedSearch) ||
      sale.customer?.name?.toLowerCase().includes(normalizedSearch) ||
      sale.cashier?.name?.toLowerCase().includes(normalizedSearch) ||
      sale.items.some((item) => item.product?.name?.toLowerCase().includes(normalizedSearch));

    return matchesPayment && matchesCustomer && matchesSearch;
  });

  const filteredUsage = usageData.filter((entry) => {
    if (usageFilter !== "ALL" && entry.transactionType !== usageFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      entry.product?.name?.toLowerCase().includes(normalizedSearch) ||
      entry.reason.toLowerCase().includes(normalizedSearch)
    );
  });

  const saleWastageCostMap = filteredUsage.reduce<Map<string, number>>((map, entry) => {
    if (entry.transactionType !== "WASTAGE" || !entry.referenceId) {
      return map;
    }

    const nextValue = (map.get(entry.referenceId) ?? 0) + entry.quantity * (entry.product?.buyingPrice ?? 0);
    map.set(entry.referenceId, nextValue);
    return map;
  }, new Map());

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalDiscount = filteredSales.reduce((sum, sale) => sum + sale.discount, 0);
  const totalMaterialCost = filteredSales.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => itemSum + item.buyingPrice * item.quantity, 0);
  }, 0);
  const totalWastageCost = filteredUsage
    .filter((entry) => entry.transactionType === "WASTAGE")
    .reduce((sum, entry) => sum + entry.quantity * (entry.product?.buyingPrice ?? 0), 0);
  const totalServiceCost = filteredSales.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => itemSum + (item.designerCost ?? 0), 0);
  }, 0);
  const totalCost = totalMaterialCost + totalWastageCost + totalServiceCost;
  const totalProfit = totalRevenue - totalCost;
  const totalMargin = getMarginPercent(totalRevenue, totalProfit);
  const totalWastage = filteredUsage
    .filter((entry) => entry.transactionType === "WASTAGE")
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const ordersCount = filteredSales.length;
  const averageOrderValue = ordersCount ? totalRevenue / ordersCount : 0;
  const registeredCustomerOrders = filteredSales.filter((sale) => sale.customer).length;
  const walkInOrders = ordersCount - registeredCustomerOrders;

  const salesTrendMap = new Map<
    string,
    { date: string; revenue: number; profit: number; orders: number; avgOrderValue: number }
  >();

  for (const sale of filteredSales) {
    const dayKey = sale.createdAt.slice(0, 10);
    const existing =
      salesTrendMap.get(dayKey) ?? {
        date: dayKey,
        revenue: 0,
        profit: 0,
        margin: 0,
        orders: 0,
        avgOrderValue: 0,
      };
    const saleCost = getSaleCost(sale, saleWastageCostMap.get(sale.id) ?? 0);

    existing.revenue += sale.total;
    existing.profit += sale.total - saleCost;
    existing.orders += 1;
    salesTrendMap.set(dayKey, existing);
  }

  const chartData = Array.from(salesTrendMap.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((entry) => ({
      ...entry,
      avgOrderValue: entry.orders ? Number((entry.revenue / entry.orders).toFixed(2)) : 0,
      margin: Number(getMarginPercent(entry.revenue, entry.profit).toFixed(2)),
      revenue: Number(entry.revenue.toFixed(2)),
      profit: Number(entry.profit.toFixed(2)),
    }));

  const productMap = new Map<
    string,
    { id: string; name: string; unitType: string; quantity: number; revenue: number; cost: number; profit: number; wastage: number }
  >();

  for (const sale of filteredSales) {
    for (const item of sale.items) {
      if (!item.product) {
        continue;
      }

      const current =
        productMap.get(item.product.id) ?? {
          id: item.product.id,
          name: item.product.name,
          unitType: item.product.unitType,
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          wastage: 0,
        };

      current.quantity += item.quantity;
      current.revenue += item.total;
      current.cost += getSaleItemCost(item);
      current.profit += item.total - getSaleItemCost(item);
      current.wastage += item.wastage || 0;
      productMap.set(item.product.id, current);
    }
  }

  const topProducts = Array.from(productMap.values())
    .sort((left, right) => right.profit - left.profit)
    .slice(0, 6);

  const paymentSummary = filteredSales.reduce<Record<string, number>>((summary, sale) => {
    summary[sale.paymentMethod] = (summary[sale.paymentMethod] ?? 0) + sale.total;
    return summary;
  }, {});

  const paymentBreakdown = Object.entries(paymentSummary)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  const summaryRows = useMemo(
    () => [
      ["Metric", "Value"],
      ["Revenue", formatCurrency(totalRevenue)],
      ["Profit", formatCurrency(totalProfit)],
      ["Total Cost", formatCurrency(totalCost)],
      ["Profit Margin", `${totalMargin.toFixed(1)}%`],
      ["Orders", formatCompactNumber(ordersCount)],
      ["Avg Order", formatCurrency(averageOrderValue)],
      ["Wastage", formatCompactNumber(totalWastage)],
      ["Wastage Cost", formatCurrency(totalWastageCost)],
      ["Discounts", formatCurrency(totalDiscount)],
      ["Service Cost", formatCurrency(totalServiceCost)],
    ],
    [
      averageOrderValue,
      ordersCount,
      totalCost,
      totalDiscount,
      totalMargin,
      totalProfit,
      totalRevenue,
      totalServiceCost,
      totalWastage,
      totalWastageCost,
    ],
  );

  const exportRows = useMemo(
    () => [
      [
        "Invoice",
        "Date",
        "Customer",
        "Cashier",
        "Payment Method",
        "Items",
        "Cost",
        "Profit",
        "Discount",
        "Total",
      ],
      ...filteredSales.map((sale) => [
        sale.invoiceNumber,
        new Date(sale.createdAt).toLocaleString(),
        sale.customer?.name || "Walk-in Customer",
        sale.cashier?.name || "-",
        sale.paymentMethod,
        sale.items.length,
        getSaleCost(sale, saleWastageCostMap.get(sale.id) ?? 0).toFixed(2),
        getSaleProfit(sale, saleWastageCostMap.get(sale.id) ?? 0).toFixed(2),
        sale.discount.toFixed(2),
        sale.total.toFixed(2),
      ]),
    ],
    [filteredSales, saleWastageCostMap],
  );

  const exportOrdersAsCsv = () => {
    const csv = [
      joinRowsAsCsv([["Adzone Business Report"], ["Report Window", activeRange.label], ["Generated At", new Date().toLocaleString()]]),
      "",
      joinRowsAsCsv(summaryRows),
      "",
      joinRowsAsCsv(exportRows),
    ].join("\n");

    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), buildExportFileName("reports", "csv"));
  };

  const exportOrdersAsExcel = () => {
    const summaryTableRows = summaryRows
      .map((row, rowIndex) => {
        const tag = rowIndex === 0 ? "th" : "td";
        const cells = row.map((value) => `<${tag}>${escapeHtml(value)}</${tag}>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const tableRows = exportRows
      .map((row, rowIndex) => {
        const tag = rowIndex === 0 ? "th" : "td";
        const cells = row.map((value) => `<${tag}>${escapeHtml(value)}</${tag}>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      h1 { font-size: 20px; margin-bottom: 8px; }
      p { color: #52525b; margin-bottom: 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d4d4d8; padding: 8px 10px; font-size: 12px; text-align: left; }
      th { background: #f4f4f5; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>Adzone Reports Export</h1>
    <p>${escapeHtml(activeRange.label)} | ${escapeHtml(`${filteredSales.length} orders`)}</p>
    <table style="margin-bottom: 20px; width: 420px;">${summaryTableRows}</table>
    <table>${tableRows}</table>
  </body>
</html>`;

    downloadBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" }), buildExportFileName("reports", "xls"));
  };

  const exportOrdersAsPdf = () => {
    const pdf = buildReportPdf(summaryRows, exportRows, activeRange.label);
    downloadBlob(new Blob([pdf], { type: "application/pdf" }), buildExportFileName("reports", "pdf"));
  };

  const handleExport = (format: "csv" | "excel" | "pdf") => {
    setIsExportMenuOpen(false);

    if (!filteredSales.length) {
      toast.error("No report data is available for export");
      return;
    }

    if (format === "csv") {
      exportOrdersAsCsv();
      toast.success("CSV export started");
      return;
    }

    if (format === "excel") {
      exportOrdersAsExcel();
      toast.success("Excel export started");
      return;
    }

    exportOrdersAsPdf();
    toast.success("PDF export started");
  };

  const presetButtons: Array<{ id: ReportPreset; label: string }> = [
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "all_time", label: "All Time" },
    { id: "custom_range", label: "Custom Range" },
    { id: "particular_date", label: "Particular Date" },
  ];

  if (loading) {
    return <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 shadow-sm">Loading reports...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Advanced Business Reports</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            Track revenue, profit, wastage, order flow, and product performance with flexible report filters.
          </p>
        </div>

        <div ref={exportMenuRef} className="relative">
          <button
            onClick={() => setIsExportMenuOpen((current) => !current)}
            className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-zinc-200 transition-all hover:bg-zinc-800"
          >
            <Download size={18} className="mr-2" />
            Export Report
          </button>

          {isExportMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl">
              <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Download As</p>
              {[
                { id: "excel" as const, label: "Excel", description: "Spreadsheet-friendly export for editing and analysis." },
                { id: "pdf" as const, label: "PDF", description: "Print-ready report for sharing or saving as PDF." },
                { id: "csv" as const, label: "CSV", description: "Raw table export for imports and lightweight reporting." },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleExport(option.id)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all hover:bg-zinc-50"
                >
                  <div className="rounded-xl bg-zinc-100 p-2 text-zinc-600">
                    <Check size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{option.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-zinc-500">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5">
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
            <Filter size={18} className="text-orange-600" />
            Report Filters
          </div>

          <div className="flex flex-wrap gap-2">
            {presetButtons.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setReportPreset(preset.id)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition-all",
                  reportPreset === preset.id
                    ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.9fr))]">
            <div className="rounded-2xl bg-zinc-50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
                <Calendar size={14} />
                Active Window
              </div>
              <p className="mt-3 text-lg font-bold text-zinc-900">{activeRange.label}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {activeRange.start && activeRange.end
                  ? `${activeRange.start.toLocaleDateString()} to ${activeRange.end.toLocaleDateString()}`
                  : "Showing the full history available in reports."}
              </p>
            </div>

            {reportPreset === "particular_date" && (
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">Date</label>
                <input
                  type="date"
                  value={particularDate}
                  onChange={(event) => setParticularDate(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>
            )}

            {reportPreset === "custom_range" && (
              <>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-400">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.85fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder="Search invoice, customer, cashier, or product..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Payments</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK">Bank</option>
          </select>

          <select
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Customers</option>
            <option value="REGISTERED">Registered</option>
            <option value="WALK_IN">Walk-in Only</option>
          </select>

          <select
            value={usageFilter}
            onChange={(event) => setUsageFilter(event.target.value)}
            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:border-orange-500 focus:bg-white focus:outline-none"
          >
            <option value="ALL">All Usage</option>
            <option value="SALE_OUT">Sales Usage</option>
            <option value="WASTAGE">Wastage Only</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {[
          {
            title: "Revenue",
            value: formatCurrency(totalRevenue),
            icon: TrendingUp,
            tone: "bg-orange-50 text-orange-600",
          },
          {
            title: "Profit",
            value: formatCurrency(totalProfit),
            icon: DollarSign,
            tone: "bg-emerald-50 text-emerald-600",
          },
          {
            title: "Total Cost",
            value: formatCurrency(totalCost),
            icon: ArrowDownRight,
            tone: "bg-amber-50 text-amber-700",
          },
          {
            title: "Profit Margin",
            value: `${totalMargin.toFixed(1)}%`,
            icon: ArrowUpRight,
            tone: "bg-emerald-50 text-emerald-600",
          },
          {
            title: "Orders",
            value: formatCompactNumber(ordersCount),
            icon: BarChart3,
            tone: "bg-blue-50 text-blue-600",
          },
          {
            title: "Avg Order",
            value: formatCurrency(averageOrderValue),
            icon: ArrowUpRight,
            tone: "bg-violet-50 text-violet-600",
          },
          {
            title: "Wastage",
            value: formatCompactNumber(totalWastage),
            icon: ArrowDownRight,
            tone: "bg-red-50 text-red-600",
          },
          {
            title: "Wastage Cost",
            value: formatCurrency(totalWastageCost),
            icon: Package,
            tone: "bg-rose-50 text-rose-600",
          },
          {
            title: "Discounts",
            value: formatCurrency(totalDiscount),
            icon: Calendar,
            tone: "bg-zinc-100 text-zinc-700",
          },
          {
            title: "Service Cost",
            value: formatCurrency(totalServiceCost),
            icon: TrendingUp,
            tone: "bg-sky-50 text-sky-600",
          },
        ].map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.title} className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className={cn("rounded-2xl p-3", card.tone)}>
                  <Icon size={20} />
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-500">{card.title}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
        <div className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Revenue, Profit, and Order Trend</h3>
              <p className="mt-1 text-sm text-zinc-500">Filter-aware performance for the selected report window.</p>
            </div>
          </div>

          <div className="mt-6 h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid #e4e4e7",
                    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                  }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#f97316" radius={[8, 8, 0, 0]} name="Revenue" />
                <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <Users size={18} className="text-orange-600" />
              Customer Mix
            </div>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Registered orders</p>
                <p className="mt-2 text-2xl font-bold text-zinc-900">{registeredCustomerOrders}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Walk-in orders</p>
                <p className="mt-2 text-2xl font-bold text-zinc-900">{walkInOrders}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-900">
              <DollarSign size={18} className="text-emerald-600" />
              Payment Breakdown
            </div>
            <div className="mt-4 space-y-3">
              {paymentBreakdown.length ? (
                paymentBreakdown.map(([method, amount]) => (
                  <div key={method} className="rounded-2xl bg-zinc-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-zinc-900">{method}</p>
                      <p className="text-sm font-bold text-zinc-900">{formatCurrency(amount)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">No sales available for the current filters.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Filtered Orders</h3>
              <p className="mt-1 text-sm text-zinc-500">Searchable order analytics with cost and profit snapshots for the selected report window.</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
              {filteredSales.length} orders
            </span>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Invoice</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Customer</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Cashier</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Payment</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Items</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Cost</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Profit</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Total</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredSales.slice(0, 12).map((sale) => (
                  <tr key={sale.id}>
                    {(() => {
                      const saleWastageCost = saleWastageCostMap.get(sale.id) ?? 0;
                      const saleCost = getSaleCost(sale, saleWastageCost);
                      const saleProfit = getSaleProfit(sale, saleWastageCost);
                      return (
                        <>
                    <td className="py-4 text-sm font-bold text-zinc-900">{sale.invoiceNumber}</td>
                    <td className="py-4 text-sm text-zinc-600">{sale.customer?.name || "Walk-in Customer"}</td>
                    <td className="py-4 text-sm text-zinc-600">{sale.cashier?.name || "-"}</td>
                    <td className="py-4 text-sm text-zinc-600">{sale.paymentMethod}</td>
                    <td className="py-4 text-sm text-zinc-600">{sale.items.length}</td>
                    <td className="py-4 text-sm text-zinc-600">{formatCurrency(saleCost)}</td>
                    <td className={cn("py-4 text-sm font-bold", saleProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {formatCurrency(saleProfit)}
                    </td>
                    <td className="py-4 text-sm font-bold text-orange-600">{formatCurrency(sale.total)}</td>
                    <td className="py-4 text-xs text-zinc-400">{new Date(sale.createdAt).toLocaleString()}</td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
                {!filteredSales.length && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-zinc-500">
                      No orders match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Top Profit Products</h3>
              <p className="mt-1 text-sm text-zinc-500">Best profit contributors within the active report filters.</p>
            </div>
            <Package size={18} className="text-orange-600" />
          </div>

          <div className="mt-5 space-y-3">
            {topProducts.length ? (
              topProducts.map((product, index) => (
                <div key={product.id} className="rounded-2xl bg-zinc-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">#{index + 1}</p>
                      <p className="mt-1 text-sm font-bold text-zinc-900">{product.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatCompactNumber(product.quantity)} {product.unitType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-bold", product.profit >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {formatCurrency(product.profit)}
                      </p>
                      <p className="text-[11px] text-zinc-500">{getMarginPercent(product.revenue, product.profit).toFixed(1)}% margin</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-zinc-500">
                    <div>Revenue: {formatCurrency(product.revenue)}</div>
                    <div>Cost: {formatCurrency(product.cost)}</div>
                    <div>Wastage: {formatCompactNumber(product.wastage)}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">No product analytics available for the current filters.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="rounded-[30px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Orders Over Time</h3>
              <p className="mt-1 text-sm text-zinc-500">Track how order volume moves through the selected period.</p>
            </div>
          </div>

          <div className="mt-6 h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "1px solid #e4e4e7",
                    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                  }}
                  formatter={(value: number, name: string) => [formatCompactNumber(value), name]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line type="monotone" dataKey="orders" stroke="#18181b" strokeWidth={3} dot={{ r: 4 }} name="Orders" />
                <Line type="monotone" dataKey="avgOrderValue" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} name="Avg Order Value" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-900 sm:text-lg">Material Usage &amp; Wastage</h3>
              <p className="mt-1 text-xs text-zinc-500 sm:text-sm">Filtered usage records with wastage visibility and reasons.</p>
            </div>
          </div>

          {/* Mobile: stacked cards (no horizontal scroll) */}
          <div className="mt-4 space-y-2.5 md:hidden">
            {filteredUsage.slice(0, 10).map((usage) => {
              const isWastage = usage.transactionType === "WASTAGE";
              return (
                <div key={usage.id} className={cn("rounded-2xl border p-3.5", isWastage ? "border-red-100 bg-red-50/40" : "border-zinc-200 bg-white")}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-bold text-zinc-900">{usage.product?.name || "Unknown Product"}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                        isWastage ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600",
                      )}
                    >
                      {usage.transactionType}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className={cn("text-lg font-bold", isWastage ? "text-red-600" : "text-zinc-900")}>
                      {formatCompactNumber(usage.quantity)}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{usage.product?.unitType}</span>
                  </div>
                  {usage.reason ? <p className="mt-2 text-xs text-zinc-500">{usage.reason}</p> : null}
                  <p className="mt-2 text-[11px] text-zinc-400">{new Date(usage.createdAt).toLocaleString()}</p>
                </div>
              );
            })}
            {!filteredUsage.length && (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                No usage records match the current filters.
              </div>
            )}
          </div>

          {/* Desktop: full table */}
          <div className="mt-6 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Material</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Type</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Quantity</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Reason</th>
                  <th className="pb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredUsage.slice(0, 10).map((usage) => (
                  <tr key={usage.id}>
                    <td className="py-4 text-sm font-bold text-zinc-900">{usage.product?.name || "Unknown Product"}</td>
                    <td className="py-4 text-xs">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 font-bold",
                          usage.transactionType === "WASTAGE" ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-600",
                        )}
                      >
                        {usage.transactionType}
                      </span>
                    </td>
                    <td className={cn("py-4 text-sm", usage.transactionType === "WASTAGE" ? "font-bold text-red-600" : "text-zinc-600")}>
                      {formatCompactNumber(usage.quantity)} {usage.product?.unitType}
                    </td>
                    <td className="py-4 text-xs text-zinc-500">{usage.reason}</td>
                    <td className="py-4 text-xs text-zinc-400">{new Date(usage.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {!filteredUsage.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-zinc-500">
                      No usage records match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
