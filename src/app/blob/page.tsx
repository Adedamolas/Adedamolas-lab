import type { Metadata } from "next";
import PressureBlob from "@/components/blob/PressureBlob";

export const metadata: Metadata = {
  title: "002 — Pressure Blob",
  description:
    "A soft body that squishes under pointer pressure and wobbles back on release.",
};

export default function BlobPage() {
  return (
    <div className="pt-12">
      <header className="pointer-events-none absolute left-4 top-24 z-10 md:left-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
          002 — GLSL / R3F / Springs
        </p>
        <h1 className="mt-3 font-serif text-4xl md:text-6xl leading-[1.05]">
          Pressure Blob
        </h1>
        <p className="mt-4 max-w-xs text-[13px] leading-5 text-secondary">
          An under-damped spring drives every deformation. On a Force Touch
          trackpad or pen it reads real hardware pressure.
        </p>
      </header>

      <PressureBlob />
    </div>
  );
}
