import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "浪乘",
  description: "台灣衝浪共乘 PWA demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
