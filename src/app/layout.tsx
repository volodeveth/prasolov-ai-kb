import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-База знань — Прасолов та Партнери",
  description: "Knowledge base powered by AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
