"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    src: "/images/aurora.png",
    title: "Aurora Residence",
    meta: "hospitality — 2026",
    width: "w-full md:w-3/4",
    align: "start",
  },
  {
    src: "/images/icca.png",
    title: "ICCA Nigeria",
    meta: "non-profit — 2026",
    width: "w-full md:w-3/5",
    align: "end",
  },
  {
    src: "/images/nichlorine.png",
    title: "Nichlorine",
    meta: "portfolio — 2025",
    width: "w-full md:w-2/3",
    align: "center",
  },
  {
    src: "/images/onyi.png",
    title: "Onyi",
    meta: "product — 2025",
    width: "w-full md:w-3/5",
    align: "start",
  },
  {
    src: "/images/bass.png",
    title: "Bass Architect Studio",
    meta: "architecture — 2023",
    width: "w-full md:w-3/4",
    align: "end",
  },
  {
    src: "/images/commentpad.png",
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
}

function DistortionPlane({
  item,
  velocity,
}: {
  item: ItemState;
  velocity: React.RefObject<number>;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const texture = useTexture(item.src);

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
    const u = material.current.uniforms;

    // Pin the plane to its DOM twin, in pixels (ortho camera = 1 unit : 1 px)
    const rect = item.el.getBoundingClientRect();
    mesh.current.position.set(
      rect.left + rect.width / 2 - state.size.width / 2,
      -(rect.top + rect.height / 2) + state.size.height / 2,
      0,
    );
    mesh.current.scale.set(rect.width, rect.height, 1);
    u.uPlaneAspect.value = rect.width / rect.height;

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
      <planeGeometry args={[1, 1, 32, 32]} />
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
  const [items, setItems] = useState<ItemState[]>([]);
  const [glReady, setGlReady] = useState(false);
  const registered = useRef(new Map<string, ItemState>());

  // Ref callbacks must be stable across renders — a fresh function each render
  // makes React detach/reattach every ref, and any setState in there loops.
  const refCallbacks = useRef(
    new Map<string, (el: HTMLDivElement | null) => void>(),
  );
  const register = useCallback((src: string) => {
    let cb = refCallbacks.current.get(src);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (!el) {
          registered.current.delete(src);
          return;
        }
        const existing = registered.current.get(src);
        if (existing) {
          existing.el = el;
          return;
        }
        registered.current.set(src, {
          el,
          src,
          hoverTarget: 0,
          mouseTarget: new THREE.Vector2(0.5, 0.5),
        });
      };
      refCallbacks.current.set(src, cb);
    }
    return cb;
  }, []);

  // Refs attach before effects run, so every image is registered by now
  useEffect(() => {
    setItems(
      IMAGES.map((img) => registered.current.get(img.src)).filter(
        (item): item is ItemState => Boolean(item),
      ),
    );
  }, []);

  const onMove = useCallback((src: string, e: React.PointerEvent) => {
    const item = registered.current.get(src);
    if (!item) return;
    const rect = item.el.getBoundingClientRect();
    item.mouseTarget.set(
      (e.clientX - rect.left) / rect.width,
      1 - (e.clientY - rect.top) / rect.height,
    );
  }, []);

  const setHover = useCallback((src: string, value: number) => {
    const item = registered.current.get(src);
    if (item) item.hoverTarget = value;
  }, []);

  return (
    <>
      {/* WebGL layer — draws over the DOM images, ignores the pointer */}
      <div className="pointer-events-none fixed inset-0 z-10">
        {items.length > 0 && (
          <Canvas
            orthographic
            camera={{ position: [0, 0, 100], zoom: 1 }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            onCreated={() => setGlReady(true)}
          >
            {items.map((item) => (
              <DistortionPlane key={item.src} item={item} velocity={velocity} />
            ))}
          </Canvas>
        )}
      </div>

      {/* DOM layer — owns layout, pointer events and the fallback render */}
      <div className="mx-auto flex max-w-[1100px] flex-col gap-24 px-4 md:gap-40 md:px-6">
        {IMAGES.map((img) => (
          <figure
            key={img.src}
            className={`${img.width} ${alignClass[img.align]}`}
          >
            <div
              ref={register(img.src)}
              className="relative aspect-[16/10] overflow-hidden"
              onPointerMove={(e) => onMove(img.src, e)}
              onPointerEnter={() => setHover(img.src, 1)}
              onPointerLeave={() => setHover(img.src, 0)}
            >
              {/* Keeps layout + acts as fallback until WebGL is up */}
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
