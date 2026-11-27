import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PatentPulse — IP Litigation Monitoring & Analytics",
  description:
    "Track patent litigation, PTAB trials, EPO oppositions, UPC disputes, ITC investigations and SEP actions. Monitor companies, patents and trends with live dashboards built on free public court data.",
  keywords: [
    "patent litigation",
    "litigation analytics",
    "PTAB",
    "UPC",
    "EPO oppositions",
    "ITC 337",
    "SEP FRAND",
    "IP intelligence",
    "CourtListener",
  ],
  authors: [{ name: "PatentPulse" }],
  openGraph: {
    title: "PatentPulse — IP Litigation Monitoring & Analytics",
    description: "Litigation monitoring and analytics across every major IP forum.",
    siteName: "PatentPulse",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${jetbrainsMono.variable} ${fraunces.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="data-theme"
          themes={["oxford", "midnight", "verde"]}
          defaultTheme="oxford"
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
