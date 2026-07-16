"use client";

import dynamic from "next/dynamic";

// WebGL + canvas atlas generation are browser-only — skip prerendering entirely
const AsciiTool = dynamic(() => import("./AsciiTool"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[50dvh] items-center justify-center border border-dashed border-line">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
        Loading engine…
      </p>
    </div>
  ),
});

export default AsciiTool;
