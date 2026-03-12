import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";
import { ThemeProvider } from "@/components/layout/theme-provider";

export const metadata: Metadata = {
  title: "F1 Pulse — Race Analytics & Visualization",
  description: "Interactive Formula 1 race visualization, telemetry analysis, and strategic insights platform.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15151e",
};

// Inline script injected before React hydration to prevent FOUC (flash of unstyled content).
// Sets the `dark` class on <html> immediately from localStorage or system preference.
const noFlashScript = `
(function(){
  try {
    var saved = localStorage.getItem('f1-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved ? saved : (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* No-flash theme script — runs before React paint */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-screen grid-bg">
        <ThemeProvider>
          <Sidebar />
          <main className="lg:ml-[220px] min-h-screen">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pt-16 lg:pt-6">
              {children}
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
