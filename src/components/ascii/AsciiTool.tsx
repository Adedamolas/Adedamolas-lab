"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { screenVertexShader, asciiFragmentShader } from "./shaders";

const CHARSETS = {
  dense: " .:-=+*#%@",
  blocks: " ░▒▓█",
  dots: " ·:•●",
  binary: " .01",
} as const;
type CharsetKey = keyof typeof CHARSETS;

type Mode = "ascii" | "dither" | "halftone";

interface Settings {
  mode: Mode;
  cell: number;
  charset: CharsetKey;
  invert: boolean;
  color: boolean;
}

interface Media {
  texture: THREE.Texture;
  aspect: number;
  source: HTMLImageElement | HTMLVideoElement;
  kind: "image" | "video";
  url?: string;
}

/** White glyphs on black, laid out in one horizontal strip. */
function makeAtlas(charset: string): THREE.CanvasTexture {
  const cell = 64;
  const canvas = document.createElement("canvas");
  canvas.width = cell * charset.length;
  canvas.height = cell;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${cell * 0.78}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [...charset].forEach((ch, i) => {
    ctx.fillText(ch, i * cell + cell / 2, cell / 2 + 3);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Classic 8x8 Bayer matrix, normalized to thresholds
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];

function makeBayerTexture(): THREE.DataTexture {
  const data = new Uint8Array(BAYER8.map((v) => ((v + 0.5) / 64) * 255));
  const tex = new THREE.DataTexture(data, 8, 8, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function Screen({
  media,
  atlas,
  bayer,
  charCount,
  settings,
}: {
  media: Media;
  atlas: THREE.Texture;
  bayer: THREE.Texture;
  charCount: number;
  settings: Settings;
}) {
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uMedia: { value: null as THREE.Texture | null },
      uAtlas: { value: null as THREE.Texture | null },
      uBayer: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCell: { value: 10 },
      uCharCount: { value: 10 },
      uMode: { value: 0 },
      uInvert: { value: 0 },
      uColorMode: { value: 0 },
    }),
    [],
  );

  useFrame(({ gl, size }) => {
    const m = material.current;
    if (!m) return;
    const u = m.uniforms;
    const dpr = gl.getPixelRatio();

    u.uMedia.value = media.texture;
    u.uAtlas.value = atlas;
    u.uBayer.value = bayer;
    (u.uResolution.value as THREE.Vector2).set(
      size.width * dpr,
      size.height * dpr,
    );
    u.uCell.value = Math.max(settings.cell, 3) * dpr;
    u.uCharCount.value = charCount;
    u.uMode.value =
      settings.mode === "ascii" ? 0 : settings.mode === "dither" ? 1 : 2;
    u.uInvert.value = settings.invert ? 1 : 0;
    u.uColorMode.value = settings.color ? 1 : 0;
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

const labelClass =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary";

const buttonClass =
  "border border-line px-3 py-1.5 text-[13px] transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] hover:border-line-strong";

export default function AsciiTool() {
  const [media, setMedia] = useState<Media | null>(null);
  const [settings, setSettings] = useState<Settings>({
    mode: "ascii",
    cell: 10,
    charset: "dense",
    invert: false,
    color: false,
  });
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const atlas = useMemo(() => {
    if (typeof document === "undefined") return null;
    return makeAtlas(CHARSETS[settings.charset]);
  }, [settings.charset]);
  useEffect(() => () => atlas?.dispose(), [atlas]);

  const bayer = useMemo(() => makeBayerTexture(), []);
  useEffect(() => () => bayer.dispose(), [bayer]);

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
      a.download = `ascii-${settings.mode}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }, [settings.mode]);

  const copyText = useCallback(async () => {
    if (!media || !stageRef.current) return;
    const charset = CHARSETS[settings.charset];
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
        if (settings.invert) luma = 1 - luma;
        out += charset[Math.round(luma * (charset.length - 1))];
      }
      out += "\n";
    }

    await navigator.clipboard.writeText(out);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [media, settings.charset, settings.cell, settings.invert]);

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
          {media && atlas && (
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
                atlas={atlas}
                bayer={bayer}
                charCount={CHARSETS[settings.charset].length}
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
            className={`${buttonClass} w-full bg-foreground text-background hover:bg-foreground/90`}
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
                onClick={() => setSettings((s) => ({ ...s, mode: key }))}
                className={`${buttonClass} flex-1 ${i > 0 ? "-ml-px" : ""} ${
                  settings.mode === key
                    ? "bg-foreground text-background"
                    : "text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className={labelClass}>
              {settings.mode === "dither" ? "Pixel size" : "Cell size"}
            </p>
            <span className="font-mono text-[11px] text-secondary tabular-nums">
              {settings.cell}px
            </span>
          </div>
          <input
            type="range"
            min={4}
            max={32}
            step={1}
            value={settings.cell}
            onChange={(e) =>
              setSettings((s) => ({ ...s, cell: Number(e.target.value) }))
            }
            className="w-full accent-white"
          />
        </div>

        {settings.mode === "ascii" && (
          <div className="space-y-2">
            <p className={labelClass}>Charset</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(CHARSETS) as CharsetKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSettings((s) => ({ ...s, charset: key }))}
                  className={`${buttonClass} ${
                    settings.charset === key
                      ? "bg-foreground text-background"
                      : "text-secondary"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className={labelClass}>Options</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setSettings((s) => ({ ...s, color: !s.color }))}
              className={`${buttonClass} flex-1 ${
                settings.color
                  ? "bg-foreground text-background"
                  : "text-secondary"
              }`}
            >
              Color
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, invert: !s.invert }))}
              className={`${buttonClass} flex-1 ${
                settings.invert
                  ? "bg-foreground text-background"
                  : "text-secondary"
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
