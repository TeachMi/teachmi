import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${assistant.variable} h-full bg-surface antialiased`}
    >
      <body className="flex min-h-full flex-col bg-surface font-body text-on-surface">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
