"use client";

import { Activity } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Logs" },
  { href: "/alerts", label: "Alerts" },
  { href: "/sources", label: "Sources" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
        <Link href="/" className="mr-1 flex items-center gap-2 text-lg font-bold sm:mr-2">
          <Activity className="size-6 text-accent" aria-hidden />
          {/* The icon alone is enough on a phone, where the three links and the theme button need the room. */}
          <span className="sr-only sm:not-sr-only">TraceLog</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 items-center gap-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
