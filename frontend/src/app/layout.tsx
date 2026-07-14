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
  title: "M&D Odontología Especializada",
  description:
    "Sistema de gestión odontológica — Dra. Maribel Condori Hilasaca, especialista en ortodoncia y ortopedia maxilar",
  icons: {
    icon: [
      { url: "/favicon.png?v=logo01-transparent", type: "image/png", sizes: "any" },
      { url: "/icon.png?v=logo01-transparent", type: "image/png" },
    ],
    shortcut: "/favicon.png?v=logo01-transparent",
    apple: "/apple-icon.png?v=logo01-transparent",
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
