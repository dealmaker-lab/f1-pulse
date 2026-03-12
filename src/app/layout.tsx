import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "F1 Pulse — Race Analytics & Visualization",
  description: "Interactive Formula 1 race visualization, telemetry analysis, and strategic insights platform.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-carbon-950 grid-bg">
        <Sidebar />
        <main className="lg:ml-[240px] min-h-screen">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pt-16 lg:pt-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
