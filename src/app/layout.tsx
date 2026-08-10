import type { Metadata } from "next";
import { Literata, Manrope, JetBrains_Mono } from "next/font/google";
import { RoleProvider } from "@/lib/roles";
import { Header } from "@/components/Header";
import "./globals.css";

const literata = Literata({
  subsets: ["latin", "cyrillic"],
  weight: ["600"],
  variable: "--font-literata",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI-База знань — Прасолов та Партнери",
  description:
    'Внутрішній AI-асистент бази знань юридичної компанії "Прасолов та Партнери". Демо-прототип на синтетичних даних.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="uk"
      className={`${literata.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <RoleProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-6">{children}</main>
        </RoleProvider>
      </body>
    </html>
  );
}
