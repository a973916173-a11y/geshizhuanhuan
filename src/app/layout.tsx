import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "@/components/Providers";
import { ADSENSE_CLIENT_ID } from "@/lib/ads-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Goldfish Format Converter — Local Media Conversion",
  description:
    "Goldfish Format Converter runs in your browser. Convert images, audio, video, and PDFs locally — files stay on your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <Script
          id="adsense-script"
          async
          strategy="afterInteractive"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
          crossOrigin="anonymous"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
