"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { blobVertexShader, blobFragmentShader } from "./shaders";

/**
 * Shared interaction state, written by pointer events and the spring,
 * read by the render loop and the DOM readout. Never React state.
 */
interface BlobState {
  /** What the spring chases: 0 idle, up to 1 while pressed */
  target: number;
  /** Spring position — overshoots negative on release, which is the wobble */
  value: number;
  velocity: number;
  pressed: boolean;
  /** How long the pointer has been held, drives the pressure ramp */
  heldFor: number;
  /** Hardware pressure if the device reports it (Force Touch, pen) */
  hardware: number;
  poke: THREE.Vector3;
}

function Blob({ stateRef }: { stateRef: React.RefObject<BlobState> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPressure: { value: 0 },
      uPoke: { value: new THREE.Vector3(0, 1, 0) },
    }),
    [],
  );

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    // Local-space contact direction — the dent follows the pointer
    const state = stateRef.current;
    if (!mesh.current) return;
    const local = mesh.current.worldToLocal(e.point.clone()).normalize();
    state.poke.copy(local);
    if (e.pressure > 0 && e.pointerType !== "mouse") {
      state.hardware = e.pressure;
    }
  };

  useFrame((three, delta) => {
    if (!mesh.current || !material.current) return;
    const state = stateRef.current;
    const dt = Math.min(delta, 1 / 30);

    // Pressure target: hardware pressure wins; otherwise holding ramps it up
    if (state.pressed) {
      state.heldFor += dt;
      const ramp = Math.min(0.35 + state.heldFor * 0.6, 1);
      state.target = Math.max(ramp, state.hardware);
    } else {
      state.heldFor = 0;
      state.target = 0;
    }

    // Under-damped spring — the low damping is what makes release jiggle
    const stiffness = 90;
    const damping = state.pressed ? 12 : 5;
    state.velocity += (state.target - state.value) * stiffness * dt;
    state.velocity *= Math.exp(-damping * dt);
    state.value += state.velocity * dt;

    const u = material.current.uniforms;
    u.uTime.value += dt;
    u.uPressure.value = state.value;
    (u.uPoke.value as THREE.Vector3).lerp(state.poke, 1 - Math.exp(-10 * dt));

    // Slow idle turn; pressure pins it still, like a held object
    mesh.current.rotation.y += dt * 0.15 * (1 - Math.min(state.value, 1) * 0.9);
  });

  return (
    <mesh
      ref={mesh}
      onPointerMove={onMove}
      onPointerDown={(e) => {
        stateRef.current.pressed = true;
        onMove(e);
      }}
      onPointerUp={() => {
        stateRef.current.pressed = false;
        stateRef.current.hardware = 0;
      }}
      onPointerLeave={() => {
        stateRef.current.pressed = false;
        stateRef.current.hardware = 0;
      }}
    >
      <icosahedronGeometry args={[1, 64]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={blobVertexShader}
        fragmentShader={blobFragmentShader}
      />
    </mesh>
  );
}

export default function PressureBlob() {
  const readout = useRef<HTMLSpanElement>(null);

  const stateRef = useRef<BlobState>({
    target: 0,
    value: 0,
    velocity: 0,
    pressed: false,
    heldFor: 0,
    hardware: 0,
    poke: new THREE.Vector3(0, 1, 0),
  });

  // Drive the DOM readout off the same spring, outside React
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (readout.current) {
        readout.current.textContent = Math.max(stateRef.current.value, 0)
          .toFixed(2)
          .padStart(4, "0");
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative h-[calc(100dvh-3rem)] w-full touch-none">
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Blob stateRef={stateRef} />
      </Canvas>

      {/* Readout — a nod to the trackpad scale */}
      <div className="pointer-events-none absolute bottom-6 left-4 flex items-baseline gap-3 md:left-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary">
          pressure
        </span>
        <span
          ref={readout}
          className="font-mono text-2xl text-foreground tabular-nums"
        >
          0.00
        </span>
      </div>

      <p className="pointer-events-none absolute bottom-6 right-4 font-mono text-[11px] uppercase tracking-[0.2em] text-tertiary md:right-6">
        press &amp; hold — harder is harder
      </p>
    </div>
  );
}
