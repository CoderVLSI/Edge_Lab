import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edge Lab — Embedded IDE",
  description: "AI-powered IDE for Arduino, ESP32, and IoT development",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Edge Lab",
    description: "AI-powered IDE for Arduino, ESP32, and IoT development",
    images: [{ url: "/logo.jpg" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
