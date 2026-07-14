import { X, Printer } from "lucide-react";
import { buildInvoiceMarkup, type OrderInvoice } from "../lib/orders";
import { useShopProfile } from "./ShopProfileProvider";

type InvoiceModalProps = {
  order: OrderInvoice;
  onClose: () => void;
  onPrint: () => void;
};

export default function InvoiceModal({ order, onClose, onPrint }: InvoiceModalProps) {
  const { shopProfile } = useShopProfile();
  const documentMarkup = buildInvoiceMarkup(order, shopProfile);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-400">A4 Invoice Preview</p>
            <h2 className="mt-1 text-xl font-bold text-zinc-900">{order.invoiceNumber}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onPrint}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-zinc-800"
            >
              <Printer size={16} />
              Print / Save PDF
            </button>
            <button onClick={onClose} className="rounded-xl border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto bg-zinc-100 p-3 sm:p-5">
          <iframe
            title={`Invoice ${order.invoiceNumber}`}
            srcDoc={documentMarkup}
            className="mx-auto block h-[78vh] w-full max-w-[820px] rounded-2xl border border-zinc-200 bg-white shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
