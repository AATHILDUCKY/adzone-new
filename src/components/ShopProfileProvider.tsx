import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "../lib/utils";
import { defaultShopProfile, normalizeShopProfile, type ShopProfile } from "../lib/shop-profile";

type ShopProfileContextValue = {
  shopProfile: ShopProfile;
  loading: boolean;
  refreshShopProfile: () => Promise<ShopProfile>;
  setShopProfile: (profile: ShopProfile) => void;
};

const ShopProfileContext = createContext<ShopProfileContextValue | undefined>(undefined);

export function ShopProfileProvider({ children }: { children: ReactNode }) {
  const [shopProfile, setShopProfile] = useState<ShopProfile>(defaultShopProfile);
  const [loading, setLoading] = useState(true);

  const refreshShopProfile = async () => {
    const response = await apiFetch("/shop-profile");
    const normalized = normalizeShopProfile(response);
    setShopProfile(normalized);
    return normalized;
  };

  useEffect(() => {
    refreshShopProfile()
      .catch(() => {
        setShopProfile(defaultShopProfile);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    document.title = `${shopProfile.shopName} POS`;
  }, [shopProfile.shopName]);

  return (
    <ShopProfileContext.Provider value={{ shopProfile, loading, refreshShopProfile, setShopProfile }}>
      {children}
    </ShopProfileContext.Provider>
  );
}

export function useShopProfile() {
  const context = useContext(ShopProfileContext);
  if (!context) {
    throw new Error("useShopProfile must be used within a ShopProfileProvider");
  }

  return context;
}
