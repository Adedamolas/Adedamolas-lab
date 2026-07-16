import Link from "next/link";

const experiments = [
  {
    number: "001",
    title: "ASCII Engine",
    description:
      "Turn your images and videos into ASCII art, ordered dither and halftone — live on the GPU.",
    tags: ["GLSL", "Dither", "Video"],
    href: "/ascii",
  },
  {
    number: "002",
    title: "Pressure Blob",
    description:
      "A soft body that squishes under pointer pressure and wobbles back on release.",
    tags: ["GLSL", "R3F", "Springs"],
    href: "/blob",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-36 pb-24 md:px-6">
      <header className="mb-16">
        <h1 className="font-serif text-5xl md:text-7xl leading-[1.05]">
          The Lab
        </h1>
        <p className="mt-4 max-w-md text-[13px] leading-5 text-secondary">
          WebGL experiments, shaders and interactive toys by{" "}
          <a
            href="https://adedamola.work"
            className="text-foreground underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
          >
            James Adedamola
          </a>
          . Things break here so they don&apos;t break there.
        </p>
      </header>

      <ul className="border-t border-line">
        {experiments.map((exp) => (
          <li key={exp.number} className="border-b border-line">
            <Link
              href={exp.href}
              className="group flex items-baseline gap-6 py-6 md:gap-10"
            >
              <span className="font-mono text-[11px] text-tertiary tabular-nums">
                {exp.number}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-serif text-2xl text-foreground transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1.5 md:text-3xl">
                  {exp.title}
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-secondary">
                  {exp.description}
                </span>
              </span>
              <span className="hidden gap-1.5 md:flex">
                {exp.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] text-tertiary"
                  >
                    {tag}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
        More coming — © adedamola, 2026
      </p>
    </div>
  );
}
