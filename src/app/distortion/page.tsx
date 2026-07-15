import type { Metadata } from "next";
import DistortionGallery from "@/components/distortion/DistortionGallery";

export const metadata: Metadata = {
  title: "001 — Distortion Gallery",
  description:
    "Project screenshots as WebGL planes — hover ripples, scroll bends, chromatic aberration.",
};

export default function DistortionPage() {
  return (
    <div className="pt-36 pb-40">
      <header className="mx-auto mb-20 max-w-[1100px] px-4 md:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
          001 — GLSL / R3F / Lenis
        </p>
        <h1 className="mt-3 font-serif text-4xl md:text-6xl leading-[1.05]">
          Distortion Gallery
        </h1>
        <p className="mt-4 max-w-md text-[13px] leading-5 text-secondary">
          Every image below is a WebGL plane pinned to its DOM twin. Scroll to
          bend them, hover to ripple them — color only exists under your
          pointer.
        </p>
      </header>

      <DistortionGallery />
    </div>
  );
}
