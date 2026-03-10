import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "./components/AppNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "水果圖鑑",
  description: "本機水果圖鑑、品飲日誌與採購清單",
  applicationName: "水果圖鑑",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "水果圖鑑",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppNav />
        {children}
      </body>
    </html>
  );
}
