"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import Lenis from "lenis";

interface LenisContextValue {
  lenis: React.RefObject<Lenis | null>;
  /** Smoothed scroll velocity in px/frame — read inside rAF loops, never subscribe. */
  velocity: React.RefObject<number>;
}

const LenisContext = createContext<LenisContextValue | null>(null);

export function useLenisContext(): LenisContextValue {
  const ctx = useContext(LenisContext);
  if (!ctx) throw new Error("useLenisContext must be used inside LenisProvider");
  return ctx;
}

export default function LenisProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const lenisRef = useRef<Lenis | null>(null);
  const velocityRef = useRef(0);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 2,
    });
    lenisRef.current = lenis;

    lenis.on("scroll", () => {
      velocityRef.current = lenis.velocity;
    });

    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return (
    <LenisContext.Provider value={{ lenis: lenisRef, velocity: velocityRef }}>
      {children}
    </LenisContext.Provider>
  );
}
