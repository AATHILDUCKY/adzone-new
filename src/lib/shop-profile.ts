export type ShopProfile = {
  shopName: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: string;
  invoiceFooter?: string;
  logoUrl?: string;
};

export const defaultShopProfile: ShopProfile = {
  shopName: "Adzone",
  tagline: "Printing Industries",
  phone: "0743838418",
  email: "adzone@gmail.com",
  address: "leththif GS street, Kinniya",
  invoiceFooter: "Thank you for your business.",
};

export function normalizeShopProfile(value: unknown): ShopProfile {
  const profile = (value && typeof value === "object" ? value : {}) as Partial<ShopProfile>;

  return {
    shopName: profile.shopName?.trim() || defaultShopProfile.shopName,
    tagline: profile.tagline?.trim() || defaultShopProfile.tagline,
    phone: profile.phone?.trim() || defaultShopProfile.phone,
    email: profile.email?.trim() || defaultShopProfile.email,
    address: profile.address?.trim() || defaultShopProfile.address,
    invoiceFooter: profile.invoiceFooter?.trim() || defaultShopProfile.invoiceFooter,
    logoUrl: profile.logoUrl?.trim() || undefined,
  };
}
