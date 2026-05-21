import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { RadixProviders } from "@/components/providers/radix-providers";
import "./globals.css";

const heebo = localFont({
  src: "../../public/fonts/heebo/Heebo-wght.ttf",
  variable: "--font-heebo",
  weight: "100 900",
  display: "swap",
});

const assistant = localFont({
  src: "../../public/fonts/assistant/Assistant-wght.ttf",
  variable: "--font-assistant",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TeachMe - שיעורים פרטיים בעברית",
  description: "TeachMe - שוק שיעורים פרטי בעברית, בישראל וב-RTL מלא.",
};

export const viewport: Viewport = {
  themeColor: "#fcf9f8",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${assistant.variable} h-full bg-surface antialiased`}
    >
      <head>
        {/* Material Symbols Outlined — loaded from Google Fonts. Used by
            marketplace surfaces for inline icons (homepage subject cards,
            tutor-profile verified badge / play overlay, etc.). Story 3.2
            introduced the first usage but didn't wire the font load; Story
            3.1 wires it here in the root layout so every page inherits
            without per-component duplication. The font CDN cost is ~5KB
            CSS + woff2 glyphs, lazy-loaded by the browser per `display=swap`. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="flex min-h-full flex-col bg-surface font-body text-on-surface">
        <RadixProviders dir="rtl">
          {children}
          {modal}
        </RadixProviders>
        <Analytics />
      </body>
    </html>
  );
}
