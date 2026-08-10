"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleSwitcher, RoleSwitcherMobile } from "@/components/RoleSwitcher";

const NAV_ITEMS = [
  { href: "/", label: "Чат" },
  { href: "/knowledge", label: "База знань" },
  { href: "/analytics", label: "Аналітика" },
  { href: "/architecture", label: "Архітектура" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-navy-700 bg-navy-900">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-2.5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          <Image
            src="/logo.svg"
            alt="Прасолов та Партнери"
            width={96}
            height={36}
            className="h-9 w-auto"
          />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-[15px] font-semibold text-ivory">
              Прасолов та Партнери
            </span>
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
              AI-База знань
            </span>
          </span>
        </Link>

        <nav
          aria-label="Основна навігація"
          className="flex flex-1 items-end gap-1 self-stretch overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap rounded-t-md px-3.5 py-2 font-body text-[13px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
                  active
                    ? "text-brass after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brass"
                    : "text-ivory-dim hover:text-ivory"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <RoleSwitcher />
          <RoleSwitcherMobile />
          <span className="hidden rounded-full border border-navy-700 px-2.5 py-1 font-body text-[11px] text-ivory-dim md:inline-block">
            Демо · синтетичні дані
          </span>
        </div>
      </div>
    </header>
  );
}
