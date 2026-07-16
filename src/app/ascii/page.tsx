import type { Metadata } from "next";
import AsciiTool from "@/components/ascii/AsciiToolLoader";

export const metadata: Metadata = {
  title: "001 — ASCII Engine",
  description:
    "Turn images and videos into ASCII art, ordered dither and halftone — live on the GPU.",
};

export default function AsciiPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-36 pb-32 md:px-6">
      <header className="mb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
          001 — GLSL / Dither / Video
        </p>
        <h1 className="mt-3 font-serif text-4xl md:text-6xl leading-[1.05]">
          ASCII Engine
        </h1>
        <p className="mt-4 max-w-md text-[13px] leading-5 text-secondary">
          Drop in an image or a video. One fragment shader turns it into ASCII
          art, ordered dither or halftone in real time — everything stays on
          your machine.
        </p>
      </header>

      <AsciiTool />
    </div>
  );
}
