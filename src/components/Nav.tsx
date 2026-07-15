"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-line bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-[1100px] items-center justify-between px-4 md:px-6">
        <a
          href="https://adedamola.work"
          className="text-[13px] text-secondary transition-colors duration-150 hover:text-foreground"
        >
          ← adedamola.work
        </a>

        {pathname !== "/" ? (
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary transition-colors duration-150 hover:text-foreground"
          >
            Lab / Index
          </Link>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
            Lab
          </span>
        )}
      </div>
    </nav>
  );
}
