import type { Metadata } from "next";
import "../src/index.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Adzone POS",
  description: "Adzone printing shop management workspace",
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
