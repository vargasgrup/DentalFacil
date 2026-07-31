import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";

/** Product font: Plus Jakarta Sans (DESIGN.md). */
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.PUBLIC_APP_URL ||
  "https://nkdentalsoft.up.railway.app"
).replace(/\/$/, "");

const SITE_NAME = "N&K DentalSoft";
const SITE_TAGLINE =
  "Sistema integral de gestión clínica odontológica — agenda, pacientes, odontograma, caja y reportes.";

export const viewport: Viewport = {
  themeColor: "#06121c",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  keywords: [
    "N&K DentalSoft",
    "software odontológico",
    "gestión clínica dental",
    "odontograma",
    "agenda dental",
  ],
  authors: [{ name: "N&K Systems" }],
  creator: "N&K Systems",
  publisher: "N&K Systems",
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png?v=nk-brand-2026", type: "image/png", sizes: "32x32" },
      { url: "/icon.png?v=nk-brand-2026", type: "image/png", sizes: "192x192" },
      {
        url: "/nkdentalsoft-icon-512.png?v=nk-brand-2026",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png?v=nk-brand-2026", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_TAGLINE,
    images: [
      {
        url: "/og-image.png?v=nk-brand-2026",
        width: 1200,
        height: 630,
        alt: "N&K DentalSoft — Sistema integral de gestión clínica odontológica",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_TAGLINE,
    images: ["/og-image.png?v=nk-brand-2026"],
  },
  other: {
    "og:image:width": "1200",
    "og:image:height": "630",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className={`${plusJakarta.className} min-h-screen antialiased`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
