import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novo Pedido de Venda | Atram Comercial",
  description: "Etapa 4 da entrada de pedidos Atram: entrada rápida, autosave local, recuperação e offline.",
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/favicon.svg`,
    shortcut: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/favicon.svg`,
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
