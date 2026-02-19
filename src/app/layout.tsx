import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GridIron Live — NFL Football Simulation",
    template: "%s | GridIron Live",
  },
  description:
    "The always-on NFL simulation. Watch live games, track your team through a full season, and experience every touchdown, turnover, and two-minute drill. More exciting than the real thing.",
  keywords: [
    "NFL",
    "football",
    "simulation",
    "live",
    "streaming",
    "sports",
    "predictions",
  ],
  authors: [{ name: "GridIron Live" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "GridIron Live",
    title: "GridIron Live — NFL Football Simulation",
    description:
      "The always-on NFL simulation. Every second is action. Every game matters.",
  },
  twitter: {
    card: "summary_large_image",
    title: "GridIron Live",
    description: "The always-on NFL simulation that never stops.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-midnight text-text-primary min-h-dvh`}
      >
        {children}
      </body>
    </html>
  );
}
