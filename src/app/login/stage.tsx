"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import css from "./stage.module.css";

const LightField = dynamic(() => import("./light-field"), { ssr: false });

/** The dark half of the sign-in page: a slow warm light beam with film grain, and a dot-matrix chart resting on it. */
export function Stage({ children, rtl = false }: { children: React.ReactNode; rtl?: boolean }) {
  const [gl, setGl] = useState<"pending" | "on" | "off">("pending");
  const onReady = useCallback(() => setGl("on"), []);
  const onFail = useCallback(() => setGl("off"), []);
  return (
    <section aria-hidden className={`${rtl ? "" : css.mirror} relative isolate ms-4 hidden overflow-hidden rounded-[26px] bg-[#050505] px-14 pt-14 pb-12 lg:flex lg:flex-col`}>
      {gl !== "on" && (
        <>
          <span className={css.beam} />
          <span className={css.beamCore} />
          <span className={css.dust} />
        </>
      )}
      {gl !== "off" && <LightField onReady={onReady} onFail={onFail} mirror={!rtl} />}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18] mix-blend-overlay">
        <filter id="lg-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#lg-grain)" />
      </svg>
      <div className="relative z-[1] mt-auto w-full">{children}</div>
    </section>
  );
}
