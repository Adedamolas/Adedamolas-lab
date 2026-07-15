"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { useLenisContext } from "@/components/LenisProvider";
import { vertexShader, fragmentShader } from "./shaders";

interface GalleryImage {
  src: string;
  title: string;
  meta: string;
  /** Tailwind width class — alternating widths give the page an editorial rhythm */
  width: string;
  align: "start" | "end" | "center";
}

const IMAGES: GalleryImage[] = [
  {
    src: "/images/gl/aurora.webp",
    title: "Aurora Residence",
    meta: "hospitality — 2026",
    width: "w-full md:w-3/4",
    align: "start",
  },
  {
    src: "/images/gl/icca.webp",
    title: "ICCA Nigeria",
    meta: "non-profit — 2026",
    width: "w-full md:w-3/5",
    align: "end",
  },
  {
    src: "/images/gl/nichlorine.webp",
    title: "Nichlorine",
    meta: "portfolio — 2025",
    width: "w-full md:w-2/3",
    align: "center",
  },
  {
    src: "/images/gl/onyi.webp",
    title: "Onyi",
    meta: "product — 2025",
    width: "w-full md:w-3/5",
    align: "start",
  },
  {
    src: "/images/gl/bass.webp",
    title: "Bass Architect Studio",
    meta: "architecture — 2023",
    width: "w-full md:w-3/4",
    align: "end",
  },
  {
    src: "/images/gl/commentpad.webp",
    title: "Commently",
    meta: "product — 2024",
    width: "w-full md:w-2/3",
    align: "start",
  },
];

/** Per-image interaction state, written by DOM events, read inside the render loop. */
interface ItemState {
  el: HTMLDivElement;
  src: string;
  hoverTarget: number;
  mouseTarget: THREE.Vector2;
  /** Cached document-space layout — measured on mount/resize, not per frame */
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureItem(item: ItemState) {
  const rect = item.el.getBoundingClientRect();
  item.top = rect.top + window.scrollY;
  item.left = rect.left + window.scrollX;
  item.width = rect.width;
  item.height = rect.height;
}

function DistortionPlane({
  src,
  getItem,
  velocity,
  onReady,
}: {
  src: string;
  getItem: (src: string) => ItemState | undefined;
  velocity: React.RefObject<number>;
  onReady: () => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const texture = useTexture(src);

  // This effect only runs once the texture has resolved (useTexture suspends),
  // so it doubles as the "safe to hide the DOM image" signal.
  useEffect(() => {
    onReady();
  }, [onReady]);

  const uniforms = useMemo(() => {
    const image = texture.image as HTMLImageElement;
    return {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uVelocity: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uPlaneAspect: { value: 1 },
      uImageAspect: { value: image.width / image.height },
    };
  }, [texture]);

  useFrame((state, delta) => {
    if (!mesh.current || !material.current) return;
    const item = getItem(src);
    if (!item) {
      mesh.current.visible = false;
      return;
    }
    // Self-heal: measured lazily if the mount-time measure hasn't run yet
    if (item.width === 0) measureItem(item);

    // Viewport-space position from cached layout — no per-frame DOM reads
    const viewTop = item.top - window.scrollY;

    // Skip everything for planes far offscreen
    const margin = 150;
    const visible =
      viewTop < state.size.height + margin && viewTop + item.height > -margin;
    mesh.current.visible = visible;
    if (!visible) return;

    mesh.current.position.set(
      item.left - window.scrollX + item.width / 2 - state.size.width / 2,
      -(viewTop + item.height / 2) + state.size.height / 2,
      0,
    );
    mesh.current.scale.set(item.width, item.height, 1);

    const u = material.current.uniforms;
    u.uPlaneAspect.value = item.width / item.height;

    // Ease interaction values — never snap
    u.uTime.value += delta;
    u.uHover.value = THREE.MathUtils.lerp(
      u.uHover.value,
      item.hoverTarget,
      1 - Math.exp(-8 * delta),
    );
    (u.uMouse.value as THREE.Vector2).lerp(
      item.mouseTarget,
      1 - Math.exp(-10 * delta),
    );

    const targetVel = THREE.MathUtils.clamp(
      (velocity.current ?? 0) / 40,
      -1,
      1,
    );
    u.uVelocity.value = THREE.MathUtils.lerp(
      u.uVelocity.value,
      targetVel,
      1 - Math.exp(-6 * delta),
    );
  });

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[1, 1, 16, 16]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}

const alignClass = {
  start: "self-start",
  end: "self-end",
  center: "self-center",
} as const;

export default function DistortionGallery() {
  const { velocity } = useLenisContext();
  const [glReady, setGlReady] = useState(false);
  const readyCount = useRef(0);
  // One stable registry for interaction state and the ref callbacks that fill
  // it. Lazily-initialized state (not refs) keeps identities fixed across
  // renders — fresh ref callbacks each render make React detach/reattach every
  // ref, and any setState in there loops.
  const [store] = useState(() => {
    const registered = new Map<string, ItemState>();
    const refCallbacks = new Map<string, (el: HTMLDivElement | null) => void>();
    for (const img of IMAGES) {
      refCallbacks.set(img.src, (el: HTMLDivElement | null) => {
        if (!el) {
          registered.delete(img.src);
          return;
        }
        const existing = registered.get(img.src);
        if (existing) {
          existing.el = el;
          return;
        }
        registered.set(img.src, {
          el,
          src: img.src,
          hoverTarget: 0,
          mouseTarget: new THREE.Vector2(0.5, 0.5),
          top: 0,
          left: 0,
          width: 0,
          height: 0,
        });
      });
    }
    return { registered, refCallbacks };
  });

  // Layout is measured on mount and on resize/font-load — never in the loop.
  useEffect(() => {
    const measureAll = () =>
      store.registered.forEach((item) => measureItem(item));

    measureAll();
    window.addEventListener("resize", measureAll);
    // Font swaps shift caption heights, which shifts every figure below them
    document.fonts?.ready.then(measureAll);

    return () => window.removeEventListener("resize", measureAll);
  }, [store]);

  const getItem = useCallback(
    (src: string) => store.registered.get(src),
    [store],
  );

  const onPlaneReady = useCallback(() => {
    readyCount.current += 1;
    if (readyCount.current >= IMAGES.length) setGlReady(true);
  }, []);

  const onMove = useCallback(
    (src: string, e: React.PointerEvent) => {
      const item = store.registered.get(src);
      if (!item) return;
      const rect = item.el.getBoundingClientRect();
      item.mouseTarget.set(
        (e.clientX - rect.left) / rect.width,
        1 - (e.clientY - rect.top) / rect.height,
      );
    },
    [store],
  );

  const setHover = useCallback(
    (src: string, value: number) => {
      const item = store.registered.get(src);
      if (item) item.hoverTarget = value;
    },
    [store],
  );

  return (
    <>
      {/* WebGL layer — draws over the DOM images, ignores the pointer */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <Canvas
          orthographic
          camera={{ position: [0, 0, 100], zoom: 1 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "high-performance",
          }}
        >
          <Suspense fallback={null}>
            {IMAGES.map((img) => (
              <DistortionPlane
                key={img.src}
                src={img.src}
                getItem={getItem}
                velocity={velocity}
                onReady={onPlaneReady}
              />
            ))}
          </Suspense>
        </Canvas>
      </div>

      {/* DOM layer — owns layout, pointer events and the fallback render */}
      <div className="mx-auto flex max-w-[1100px] flex-col gap-24 px-4 md:gap-40 md:px-6">
        {IMAGES.map((img) => (
          <figure
            key={img.src}
            className={`${img.width} ${alignClass[img.align]}`}
          >
            <div
              ref={store.refCallbacks.get(img.src)}
              className="relative aspect-[16/10] overflow-hidden"
              onPointerMove={(e) => onMove(img.src, e)}
              onPointerEnter={() => setHover(img.src, 1)}
              onPointerLeave={() => setHover(img.src, 0)}
            >
              {/* Keeps layout + stays visible until every texture is on the GPU */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.src}
                alt={img.title}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  glReady ? "opacity-0" : "opacity-100 grayscale"
                }`}
                draggable={false}
              />
            </div>
            <figcaption className="mt-3 flex items-baseline justify-between">
              <span className="font-serif text-xl text-foreground">
                {img.title}
              </span>
              <span className="font-mono text-[11px] text-tertiary">
                {img.meta}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
