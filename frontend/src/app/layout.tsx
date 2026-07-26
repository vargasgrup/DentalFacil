import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "N&K DentalSoft",
  description:
    "Sistema de gestión odontológica — N&K DentalSoft / M&D Odontología Especializada",
  applicationName: "N&K DentalSoft",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png?v=nkdentalsoft-icon-v2", type: "image/png", sizes: "any" },
      { url: "/icon.png?v=nkdentalsoft-icon-v2", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png?v=nkdentalsoft-icon-v2",
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
