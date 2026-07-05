import type { Metadata, Viewport } from "next";
import { Titillium_Web, Fira_Code } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/layout/theme-provider";

// Self-hosted at build time — no render-blocking Google request, works
// offline. Exposed as CSS variables so globals.css / Tailwind reference them.
// (The old globals.css @import sat after @tailwind and was silently dropped
// by browsers, so the whole app had been falling back to system-ui.)
const titillium = Titillium_Web({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "900"],
  variable: "--font-titillium",
  display: "swap",
});
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code",
  display: "swap",
});

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
          colorInput: "#1e1e2a",
          colorInputForeground: "#ffffff",
          fontFamily: "'Titillium Web', system-ui, sans-serif",
        },
      }}
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${titillium.variable} ${firaCode.variable}`}
      >
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
