import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuickSellPro - SMS Numbers",
  description: "Premium SMS verification numbers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
