import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRAZA",
  description: "Gestión y trazabilidad para proyectos de construcción e infraestructura"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
