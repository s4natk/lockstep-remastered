"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="currentColor" />
      <path d="M8 7v14h5v-5h7V7h-5v5h-2V7H8Z" fill="var(--investigation-paper, #fafbf9)" />
    </svg>
  );
}

export function Arrow({ direction = "right" }: { direction?: "right" | "up" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={direction === "up" ? { transform: "rotate(-45deg)" } : undefined}
    >
      <path
        d="M4 10h12m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/investigate", label: "Investigate" },
    { href: "/history", label: "History" },
    { href: "/how-it-works", label: "How it works" },
  ];
  return (
    <div className="investigation-app">
      <a className="investigation-skip" href="#main-content">
        Skip to content
      </a>
      <header className="product-header">
        <div className="product-header-inner">
          <Link href="/" className="product-brand" aria-label="Lockstep home">
            <Mark />
            <span>
              lockstep<span className="brand-period">.</span>
            </span>
          </Link>
          <nav className="product-navigation" aria-label="Main navigation">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="specialized-link" href="/sql">
            SQL review <Arrow direction="up" />
          </Link>
        </div>
      </header>
      <main id="main-content" className={wide ? "product-main product-main-wide" : "product-main"}>
        {children}
      </main>
      <footer className="product-footer">
        <span>Lockstep / AI debugging & incident investigation</span>
        <span>Evidence first. A clearer next step.</span>
      </footer>
    </div>
  );
}
