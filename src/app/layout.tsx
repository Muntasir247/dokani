import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dokani - Modern Retail POS & Inventory SaaS",
  description: "Multi-tenant, offline-first Point-of-Sale and inventory SaaS for retail shops in Bangladesh.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
