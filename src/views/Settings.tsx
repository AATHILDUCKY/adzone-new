import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ShieldAlert, Store, Upload, Trash2, Save, FileText, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useShopProfile } from "../components/ShopProfileProvider";
import { useOutletContext } from "../components/OutletContext";
import { normalizeShopProfile, type ShopProfile } from "../lib/shop-profile";
import { apiFetch } from "../lib/utils";

type OutletContext = {
  user: {
    role: string;
  };
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read logo file"));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { user } = useOutletContext<OutletContext>();
  const { shopProfile, setShopProfile } = useShopProfile();
  const [formData, setFormData] = useState<ShopProfile>(shopProfile);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const data = await apiFetch("/printers");
      setPrinters(Array.isArray(data.printers) ? data.printers : []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load printers");
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    setFormData(shopProfile);
  }, [shopProfile]);

  useEffect(() => {
    void loadPrinters();
  }, []);

  if (user.role !== "ADMIN") {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5" />
          <div>
            <h1 className="text-xl font-bold">Admin Access Required</h1>
            <p className="mt-2 text-sm text-amber-800">Only administrators can update the shop profile and invoice branding.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (field: keyof ShopProfile, value: string) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 450 * 1024) {
      toast.error("Logo must be smaller than 450 KB");
      event.target.value = "";
      return;
    }

    try {
      const logoUrl = await readFileAsDataUrl(file);
      handleChange("logoUrl", logoUrl);
    } catch (error: any) {
      toast.error(error.message || "Failed to load logo");
    } finally {
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const updatedProfile = normalizeShopProfile(
        await apiFetch("/api/shop-profile", {
          method: "PUT",
          body: JSON.stringify(formData),
        }),
      );

      setShopProfile(updatedProfile);
      toast.success("Shop profile updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update shop profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Shop Profile</h1>
          <p className="text-zinc-500">Change the shop name, branding, and invoice details in one place.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Live Effect</p>
          <p className="mt-2 text-sm text-zinc-700">Sidebar, login page, and invoices update from this profile.</p>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <form onSubmit={handleSubmit} className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-orange-50 p-3 text-orange-700">
              <Store size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Brand Details</h2>
              <p className="text-sm text-zinc-500">Keep your storefront identity consistent everywhere.</p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Shop Name</label>
              <input
                required
                type="text"
                value={formData.shopName || ""}
                onChange={(event) => handleChange("shopName", event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
                placeholder="Your shop name"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Tagline</label>
              <input
                type="text"
                value={formData.tagline || ""}
                onChange={(event) => handleChange("tagline", event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
                placeholder="Short business description"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Phone</label>
              <input
                type="text"
                value={formData.phone || ""}
                onChange={(event) => handleChange("phone", event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
                placeholder="+94 77 123 4567"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Email</label>
              <input
                type="email"
                value={formData.email || ""}
                onChange={(event) => handleChange("email", event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
                placeholder="hello@shop.com"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Address</label>
              <textarea
                value={formData.address || ""}
                onChange={(event) => handleChange("address", event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
                placeholder="Shop address shown on invoices"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Invoice Footer</label>
              <textarea
                value={formData.invoiceFooter || ""}
                onChange={(event) => handleChange("invoiceFooter", event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
                placeholder="Thank-you note, refund note, or payment reminder"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <Printer size={16} /> Invoice Printer
                </label>
                <button
                  type="button"
                  onClick={() => void loadPrinters()}
                  disabled={loadingPrinters}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loadingPrinters ? "animate-spin" : ""} />
                  Refresh printers
                </button>
              </div>
              <select
                value={formData.printerName || ""}
                onChange={(event) => handleChange("printerName", event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5"
              >
                <option value="">Use browser print dialog</option>
                {formData.printerName && !printers.includes(formData.printerName) ? (
                  <option value={formData.printerName}>{formData.printerName} (currently unavailable)</option>
                ) : null}
                {printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}
              </select>
              <p className="text-xs text-zinc-500">
                Saved invoices print directly on ISO B5 paper. Printers are provided by this computer's print system.
              </p>
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Shop Logo</label>
              <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  {formData.logoUrl ? (
                    <img src={formData.logoUrl} alt="Shop logo preview" className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400">
                      <Store size={24} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Upload a square logo for navigation and invoices</p>
                    <p className="text-xs text-zinc-500">PNG, JPG, or WebP under 450 KB works best.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
                    <Upload size={16} />
                    Upload Logo
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                  </label>
                  {formData.logoUrl ? (
                    <button
                      type="button"
                      onClick={() => handleChange("logoUrl", "")}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setFormData(shopProfile)}
              className="rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Shop Profile"}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-zinc-100 p-3 text-zinc-700">
                <FileText size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Invoice Preview</h2>
                <p className="text-sm text-zinc-500">What customers will see on printed invoices.</p>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="flex items-start gap-4 border-b border-zinc-200 pb-5">
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Invoice logo preview" className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover" />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold text-zinc-900">{formData.shopName || "Shop name"}</p>
                  {formData.tagline ? <p className="mt-1 text-sm text-zinc-500">{formData.tagline}</p> : null}
                  {formData.phone ? <p className="mt-3 text-sm text-zinc-600">{formData.phone}</p> : null}
                  {formData.email ? <p className="text-sm text-zinc-600">{formData.email}</p> : null}
                  {formData.address ? <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">{formData.address}</p> : null}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm text-zinc-600">
                  <span>Invoice</span>
                  <span className="font-semibold text-zinc-900">INV-20260331</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm text-zinc-600">
                  <span>Customer</span>
                  <span className="font-semibold text-zinc-900">Walk-in Customer</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-zinc-900 px-4 py-4 text-sm text-white">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold">LKR 1,250.00</span>
                </div>
              </div>

              {formData.invoiceFooter ? (
                <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-500">
                  {formData.invoiceFooter}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
