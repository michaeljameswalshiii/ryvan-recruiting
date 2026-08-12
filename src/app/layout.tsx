import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * UI sans: Inter — designed for screens, high x-height, clear at 12–14px.
 * Loaded as a variable font with display swap so text never flashes invisible.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  // Prefer metrics close to system UI for less layout shift
  adjustFontFallback: true,
});

/** Keys, IDs, code snippets — tabular, unambiguous characters */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Trio Recruiting",
  description: "Trio Recruiting Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-background text-foreground antialiased`}
      >
        <ThemeProvider>
          <Providers>{children}</Providers>
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
