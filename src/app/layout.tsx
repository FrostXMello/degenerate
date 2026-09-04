import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEGENERATE — Bar",
  description: "Bar management and party ledger for DEGENERATE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased overflow-x-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
