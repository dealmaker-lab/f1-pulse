import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/layout/theme-provider";

export const metadata: Metadata = {
  title: "F1 Pulse — Race Analytics & Visualization",
  description:
    "Interactive Formula 1 race visualization, telemetry analysis, and strategic insights platform.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15151e",
};

// Inline script injected before React hydration to prevent FOUC.
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#e10600",
          colorBackground: "#15151e",
          colorInputBackground: "#1e1e2a",
          colorInputText: "#ffffff",
          fontFamily: "'Titillium Web', system-ui, sans-serif",
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        </head>
        <body className="min-h-screen grid-bg">
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
