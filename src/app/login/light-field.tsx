"use client";

import { useEffect, useRef } from "react";

/**
 * A slow, domain-warped light field (coral, ember, violet, amber on black) drawn
 * with a tiny raw-WebGL fragment shader. Renders at half resolution with the
 * pixel ratio capped at 1.5, pauses while the tab is hidden and holds a single
 * frame when reduced motion is on. Calls onFail when WebGL isn't available so
 * the CSS fallback stays visible.
 */
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
vec3 b(vec2 p,vec2 c,float s,vec3 k){float d=length(p-c);return k*exp(-d*d/s);}
void main(){vec2 u=gl_FragCoord.xy/r;vec2 p=vec2(u.x*r.x/r.y,u.y);
vec2 q=vec2(fb(p*1.7+t),fb(p*1.7-t+5.2));p+=(q-.5)*.55;float a=r.x/r.y;
vec3 c=b(p,vec2(a*(.22+.08*sin(t*6.)),.86+.06*cos(t*5.)),.075,vec3(1.,.54,.36));
c+=b(p,vec2(a*(.38+.1*cos(t*4.)),.66),.035,vec3(.91,.47,.37))*.6;
c+=b(p,vec2(a*(.86+.06*sin(t*5.+1.)),.5+.1*sin(t*3.)),.06,vec3(.36,.29,.84))*.85;
c+=b(p,vec2(a*(.42+.12*sin(t*3.+2.)),-.02),.06,vec3(.85,.6,.17))*.75;
c*=.8+.35*fb(p*3.+t*2.);float l=max(c.r,max(c.g,c.b));c*=(1.-exp(-l*1.7))/max(l,.001);gl_FragColor=vec4(c,1.);}`;
const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

export default function LightField({ onFail, onReady }: { onFail?: () => void; onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!canvas || !gl || gl.isContextLost()) return onFail?.();
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
      console.warn("light field shader:", gl.getShaderInfoLog(s));
      return null;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    if (!vs || !fs) return onFail?.();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return onFail?.();
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = Math.min(1.5, window.devicePixelRatio || 1) * 0.5;
    let raf = 0;
    const t0 = performance.now() - 40_000; // start mid-drift, not at the symmetric first frame
    const frame = (now: number) => {
      gl.uniform1f(uT, ((now - t0) / 1000) * 0.05);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uR, canvas.width, canvas.height);
      if (still) frame(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(frame);
    onReady?.();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [onFail, onReady]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
