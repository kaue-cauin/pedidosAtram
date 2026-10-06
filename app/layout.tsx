import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novo Pedido de Venda | Atram Comercial",
  description: "Etapa 1 da interface de entrada de pedidos da Atram: estrutura visual e dados fictícios.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
