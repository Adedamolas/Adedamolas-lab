"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { screenVertexShader, asciiFragmentShader } from "./shaders";
import { makeFillAtlas, makeEdgeAtlas, type FillAtlas } from "./atlas";
import { makeBayerTextures, floydSteinberg } from "./dither";

const CHARSETS = {
  dense: " .:-=+*#%@",
  acerola: " .;coPO?@█",
  blocks: " ░▒▓█",
  dots: " ·:•●",
} as const;
type CharsetKey = keyof typeof CHARSETS;

type Mode = "ascii" | "dither" | "halftone";
type DitherAlgo = "bayer2" | "bayer4" | "bayer8" | "noise" | "floyd";

interface Settings {
  mode: Mode;
  // ascii
  cell: number;
  charset: CharsetKey;
  edges: boolean;
  // dither
  algorithm: DitherAlgo;
  pixel: number;
  // halftone
  dot: number;
  angle: number;
  // shared tone pipeline
  exposure: number;
  gamma: number;
  invert: boolean;
  color: boolean;
}

const DEFAULTS: Settings = {
  mode: "ascii",
  cell: 14,
  charset: "dense",
  edges: true,
  algorithm: "floyd",
  pixel: 2,
  dot: 12,
  angle: 45,
  exposure: 1,
  gamma: 1,
  invert: false,
  color: false,
};

interface Media {
  texture: THREE.Texture;
  aspect: number;
  source: HTMLImageElement | HTMLVideoElement;
  kind: "image" | "video";
  url?: string;
}

function Screen({
  media,
  fillAtlas,
  edgeAtlas,
  bayer,
  floydTex,
  settings,
}: {
  media: Media;
  fillAtlas: FillAtlas;
  edgeAtlas: THREE.Texture;
  bayer: { texture: THREE.Texture; size: number };
  floydTex: React.RefObject<THREE.DataTexture | null>;
  settings: Settings;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uMedia: { value: null as THREE.Texture | null },
      uAtlas: { value: null as THREE.Texture | null },
      uEdgeAtlas: { value: null as THREE.Texture | null },
      uBayer: { value: null as THREE.Texture | null },
      uFloyd: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCell: { value: 14 },
      uPixel: { value: 2 },
      uCharCount: { value: 10 },
      uBayerSize: { value: 4 },
      uMode: { value: 0 },
      uAlgorithm: { value: 0 },
      uEdges: { value: 0 },
      uExposure: { value: 1 },
      uGamma: { value: 1 },
      uInvert: { value: 0 },
      uColorMode: { value: 0 },
      uAngle: { value: 0 },
    }),
    [],
  );

  useFrame(({ gl, size }) => {
    const m = material.current;
    if (!m) return;
    const u = m.uniforms;
    const dpr = gl.getPixelRatio();

    u.uMedia.value = media.texture;
    u.uAtlas.value = fillAtlas.texture;
    u.uEdgeAtlas.value = edgeAtlas;
    u.uBayer.value = bayer.texture;
    u.uFloyd.value = floydTex.current;
    (u.uResolution.value as THREE.Vector2).set(
      size.width * dpr,
      size.height * dpr,
    );

    const cell = settings.mode === "halftone" ? settings.dot : settings.cell;
    u.uCell.value = Math.max(cell, 4) * dpr;
    u.uPixel.value = Math.max(settings.pixel, 1) * dpr;
    u.uCharCount.value = fillAtlas.orderedCharset.length;
    u.uBayerSize.value = bayer.size;
    u.uMode.value =
      settings.mode === "ascii" ? 0 : settings.mode === "dither" ? 1 : 2;
    u.uAlgorithm.value =
      settings.algorithm === "noise"
        ? 1
        : settings.algorithm === "floyd"
          ? 2
          : 0;
    u.uEdges.value = settings.edges ? 1 : 0;
    u.uExposure.value = settings.exposure;
    u.uGamma.value = settings.gamma;
    u.uInvert.value = settings.invert ? 1 : 0;
    u.uColorMode.value = settings.color ? 1 : 0;
    u.uAngle.value = (settings.angle * Math.PI) / 180;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={screenVertexShader}
        fragmentShader={asciiFragmentShader}
      />
    </mesh>
  );
}

const MODES: { key: Mode; label: string }[] = [
  { key: "ascii", label: "ASCII" },
  { key: "dither", label: "Dither" },
  { key: "halftone", label: "Halftone" },
];

const ALGOS: { key: DitherAlgo; label: string }[] = [
  { key: "floyd", label: "Floyd–Steinberg" },
  { key: "bayer2", label: "Bayer 2×2" },
  { key: "bayer4", label: "Bayer 4×4" },
  { key: "bayer8", label: "Bayer 8×8" },
  { key: "noise", label: "Noise" },
];

const labelClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary";

const buttonClass =
  "border border-line px-3 py-1.5 text-[13px] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] hover:border-line-strong";

const activeClass = "bg-foreground text-background";

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className={labelClass}>{label}</p>
        <span className="font-mono text-[11px] text-secondary tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white"
      />
    </div>
  );
}

export default function AsciiTool() {
  const [media, setMedia] = useState<Media | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floydTexRef = useRef<THREE.DataTexture | null>(null);
  const floydScratchRef = useRef<{ canvas: HTMLCanvasElement | null }>({
    canvas: null,
  });

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const fillAtlas = useMemo(() => {
    if (typeof document === "undefined") return null;
    return makeFillAtlas(CHARSETS[settings.charset]);
  }, [settings.charset]);
  useEffect(() => () => fillAtlas?.texture.dispose(), [fillAtlas]);

  const edgeAtlas = useMemo(() => {
    if (typeof document === "undefined") return null;
    return makeEdgeAtlas();
  }, []);
  useEffect(() => () => edgeAtlas?.dispose(), [edgeAtlas]);

  const bayers = useMemo(() => makeBayerTextures(), []);
  useEffect(
    () => () => Object.values(bayers).forEach((b) => b.texture.dispose()),
    [bayers],
  );
  const bayer =
    settings.algorithm === "bayer2" || settings.algorithm === "bayer8"
      ? bayers[settings.algorithm]
      : bayers.bayer4;

  // Default media so the page is never empty
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = "/images/gl/aurora.webp";
    img.onload = () => {
      if (cancelled) return;
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      setMedia((prev) =>
        prev
          ? prev
          : {
              texture: tex,
              aspect: img.width / img.height,
              source: img,
              kind: "image",
            },
      );
    };
    return () => {
      cancelled = true;
    };
  }, []);

  // Dispose replaced media
  useEffect(() => {
    if (!media) return;
    return () => {
      media.texture.dispose();
      if (media.kind === "video") (media.source as HTMLVideoElement).pause();
      if (media.url) URL.revokeObjectURL(media.url);
    };
  }, [media]);

  // --- Floyd–Steinberg: CPU pass -> texture ---
  const recomputeFloyd = useCallback(() => {
    const stage = stageRef.current;
    if (!media || !stage || stage.clientWidth === 0) return;

    const cols = Math.max(4, Math.floor(stage.clientWidth / settings.pixel));
    const rows = Math.max(4, Math.floor(stage.clientHeight / settings.pixel));

    let tex = floydTexRef.current;
    const reuse =
      tex && tex.image.width === cols && tex.image.height === rows
        ? (tex.image.data as Uint8Array)
        : undefined;

    const data = floydSteinberg(
      media.source,
      cols,
      rows,
      {
        exposure: settings.exposure,
        gamma: settings.gamma,
        invert: settings.invert,
        color: settings.color,
      },
      floydScratchRef.current,
      reuse,
    );

    if (!reuse) {
      tex?.dispose();
      tex = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      floydTexRef.current = tex;
    }
    floydTexRef.current!.needsUpdate = true;
  }, [
    media,
    settings.pixel,
    settings.exposure,
    settings.gamma,
    settings.invert,
    settings.color,
  ]);

  const floydActive =
    settings.mode === "dither" && settings.algorithm === "floyd";

  // Images: recompute when tone/scale settings change
  useEffect(() => {
    if (floydActive && media?.kind === "image") recomputeFloyd();
  }, [floydActive, media, recomputeFloyd]);

  // Video: recompute every ~40ms while playing
  useEffect(() => {
    if (!floydActive || media?.kind !== "video") return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 40) {
        last = t;
        recomputeFloyd();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [floydActive, media, recomputeFloyd]);

  const loadFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);

    if (file.type.startsWith("video")) {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        video.play();
        const tex = new THREE.VideoTexture(video);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        setVideoPaused(false);
        setMedia({
          texture: tex,
          aspect: video.videoWidth / video.videoHeight,
          source: video,
          kind: "video",
          url,
        });
      };
      return;
    }

    if (file.type.startsWith("image")) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        setMedia({
          texture: tex,
          aspect: img.width / img.height,
          source: img,
          kind: "image",
          url,
        });
      };
      return;
    }

    URL.revokeObjectURL(url);
  }, []);

  const exportPng = useCallback(() => {
    const canvas = glRef.current?.domElement;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${settings.mode}-export.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }, [settings.mode]);

  const copyText = useCallback(async () => {
    if (!media || !stageRef.current || !fillAtlas) return;
    const charset = fillAtlas.orderedCharset;
    const stage = stageRef.current;
    const cols = Math.max(2, Math.round(stage.clientWidth / settings.cell));
    // Monospace glyphs are ~2x taller than wide — halve rows to keep aspect
    const rows = Math.max(
      2,
      Math.round(stage.clientHeight / settings.cell / 2),
    );

    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(media.source, 0, 0, cols, rows);
    const { data } = ctx.getImageData(0, 0, cols, rows);

    let out = "";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        let luma =
          (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) /
          255;
        luma = Math.pow(
          Math.min(luma * settings.exposure, 1),
          settings.gamma,
        );
        if (settings.invert) luma = 1 - luma;
        out +=
          charset[
            Math.min(charset.length - 1, Math.floor(luma * charset.length))
          ];
      }
      out += "\n";
    }

    await navigator.clipboard.writeText(out);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [media, fillAtlas, settings.cell, settings.exposure, settings.gamma, settings.invert]);

  const toggleVideo = useCallback(() => {
    if (media?.kind !== "video") return;
    const video = media.source as HTMLVideoElement;
    if (video.paused) {
      video.play();
      setVideoPaused(false);
    } else {
      video.pause();
      setVideoPaused(true);
    }
  }, [media]);

  const aspect = media?.aspect ?? 16 / 10;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      {/* Stage */}
      <div
        className={`relative flex-1 border transition-colors duration-150 ${
          dragOver ? "border-dashed border-line-strong" : "border-line"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) loadFile(file);
        }}
      >
        <div
          ref={stageRef}
          className="relative mx-auto w-full"
          style={{
            aspectRatio: String(aspect),
            maxWidth: `calc(66dvh * ${aspect})`,
          }}
        >
          {media && fillAtlas && edgeAtlas && (
            <Canvas
              dpr={[1, 1.5]}
              gl={{
                antialias: false,
                alpha: false,
                preserveDrawingBuffer: true,
                powerPreference: "high-performance",
              }}
              onCreated={(state) => {
                glRef.current = state.gl;
              }}
            >
              <Screen
                media={media}
                fillAtlas={fillAtlas}
                edgeAtlas={edgeAtlas}
                bayer={bayer}
                floydTex={floydTexRef}
                settings={settings}
              />
            </Canvas>
          )}
        </div>

        {media?.kind === "video" && (
          <button
            onClick={toggleVideo}
            className={`absolute bottom-3 left-3 ${buttonClass} bg-background/80 backdrop-blur-sm`}
          >
            {videoPaused ? "Play" : "Pause"}
          </button>
        )}
      </div>

      {/* Controls */}
      <aside className="w-full shrink-0 space-y-6 lg:w-72">
        <div className="space-y-2">
          <p className={labelClass}>Source</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`${buttonClass} w-full ${activeClass} hover:bg-foreground/90`}
          >
            Upload image or video
          </button>
          <p className="text-[13px] leading-5 text-tertiary">
            …or drop a file onto the stage. Nothing leaves your browser.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="space-y-2">
          <p className={labelClass}>Mode</p>
          <div className="flex">
            {MODES.map(({ key, label }, i) => (
              <button
                key={key}
                onClick={() => set("mode", key)}
                className={`${buttonClass} flex-1 ${i > 0 ? "-ml-px" : ""} ${
                  settings.mode === key ? activeClass : "text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {settings.mode === "ascii" && (
          <>
            <Slider
              label="Cell size"
              value={settings.cell}
              min={8}
              max={32}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => set("cell", v)}
            />
            <div className="space-y-2">
              <p className={labelClass}>Charset</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(CHARSETS) as CharsetKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => set("charset", key)}
                    className={`${buttonClass} ${
                      settings.charset === key ? activeClass : "text-secondary"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => set("edges", !settings.edges)}
              className={`${buttonClass} w-full ${
                settings.edges ? activeClass : "text-secondary"
              }`}
            >
              Edge glyphs {settings.edges ? "on" : "off"}
            </button>
          </>
        )}

        {settings.mode === "dither" && (
          <>
            <div className="space-y-2">
              <p className={labelClass}>Algorithm</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALGOS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => set("algorithm", key)}
                    className={`${buttonClass} ${
                      key === "floyd" ? "col-span-2" : ""
                    } ${
                      settings.algorithm === key
                        ? activeClass
                        : "text-secondary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Slider
              label="Pixel size"
              value={settings.pixel}
              min={1}
              max={8}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => set("pixel", v)}
            />
          </>
        )}

        {settings.mode === "halftone" && (
          <>
            <Slider
              label="Dot size"
              value={settings.dot}
              min={6}
              max={28}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => set("dot", v)}
            />
            <Slider
              label="Grid angle"
              value={settings.angle}
              min={0}
              max={90}
              step={1}
              format={(v) => `${v}°`}
              onChange={(v) => set("angle", v)}
            />
          </>
        )}

        <div className="space-y-4 border-t border-line pt-5">
          <Slider
            label="Exposure"
            value={settings.exposure}
            min={0.2}
            max={2.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => set("exposure", v)}
          />
          <Slider
            label="Gamma"
            value={settings.gamma}
            min={0.3}
            max={2.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => set("gamma", v)}
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => set("color", !settings.color)}
              className={`${buttonClass} flex-1 ${
                settings.color ? activeClass : "text-secondary"
              }`}
            >
              Color
            </button>
            <button
              onClick={() => set("invert", !settings.invert)}
              className={`${buttonClass} flex-1 ${
                settings.invert ? activeClass : "text-secondary"
              }`}
            >
              Invert
            </button>
          </div>
        </div>

        <div className="space-y-1.5 border-t border-line pt-5">
          <p className={labelClass}>Export</p>
          <div className="flex gap-1.5">
            <button onClick={exportPng} className={`${buttonClass} flex-1`}>
              Save PNG
            </button>
            {settings.mode === "ascii" && (
              <button onClick={copyText} className={`${buttonClass} flex-1`}>
                {copied ? "Copied!" : "Copy as text"}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
