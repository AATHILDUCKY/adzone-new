"use client";

import { Toaster } from "sonner";
import { ShopProfileProvider } from "../src/components/ShopProfileProvider";
import { AppSessionProvider } from "../src/components/AppSessionProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ShopProfileProvider>
      <AppSessionProvider>
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border !border-white/80 !bg-white/95 !text-zinc-900 !shadow-2xl",
              description: "!text-zinc-500",
            },
          }}
        />
        {children}
      </AppSessionProvider>
    </ShopProfileProvider>
  );
}
