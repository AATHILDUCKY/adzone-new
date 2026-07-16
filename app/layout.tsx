import type { Metadata, Viewport } from "next";
import "../src/index.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Adzone POS",
  description: "Adzone printing shop management workspace",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
