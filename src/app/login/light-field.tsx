"use client";

import { useEffect, useRef } from "react";

/**
 * "Beam": one warm shaft of light falling from the top corner, with soft
 * god-ray striations and dust motes that only glint inside the beam. Drawn with
 * a tiny raw-WebGL fragment shader at half resolution (pixel ratio capped at
 * 1.5); pauses while the tab is hidden and holds a single frame when reduced
 * motion is on. Calls onFail when WebGL isn't available so the CSS fallback
 * stays visible. `mirror` flips the beam so it always falls from the stage's outer corner.
 */
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform float m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
float beam(vec2 v,float ang,float w0,float g){vec2 d=vec2(cos(ang),sin(ang));vec2 q=vec2(-d.y,d.x);float al=dot(v,d);float ac=dot(v,q);float w=w0+al*g;return exp(-ac*ac/(w*w))*smoothstep(0.,.3,al)*exp(-al*.8);}
void main(){vec2 u=gl_FragCoord.xy/r;if(m>.5)u.x=1.-u.x;float a=r.x/r.y;vec2 p=vec2(u.x*a,u.y);
vec2 o=vec2(-.15*a,1.25);vec2 v=p-o;float ang=-.92+.05*sin(t*3.1)+.02*sin(t*7.3);
float B=beam(v,ang,.05,.17);float C=beam(v,ang+.015*sin(t*4.),.018,.07);
vec2 d=vec2(cos(ang),sin(ang));vec2 q=vec2(-d.y,d.x);float al=dot(v,d);float ac=dot(v,q);
float rays=.62+.38*fb(vec2(ac*9.,al*.8-t*1.5));
vec3 warm=vec3(1.,.66,.5);vec3 core=vec3(1.,.9,.82);
vec3 c=warm*B*rays*.85+core*C*.75;
vec2 g=p*vec2(46.)+vec2(t*6.,-t*14.);vec2 id=floor(g);vec2 f=fract(g)-.5;vec2 j=vec2(h(id),h(id+7.3))-.5;
float dm=step(.9,h(id+3.1))*exp(-dot(f-j*.6,f-j*.6)*140.)*(.5+.5*sin(t*40.+h(id)*30.));
c+=core*dm*smoothstep(.15,.6,B)*1.8;
c+=vec3(.9,.5,.36)*.05*exp(-length(p-vec2(.75*a,.05))*2.2);
float l=max(c.r,max(c.g,c.b));c*=(1.-exp(-l*1.6))/max(l,.001);gl_FragColor=vec4(c,1.);}`;
const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

export default function LightField({ onFail, onReady, mirror = false }: { onFail?: () => void; onReady?: () => void; mirror?: boolean }) {
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
    gl.uniform1f(gl.getUniformLocation(prog, "m"), mirror ? 1 : 0);

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
  }, [onFail, onReady, mirror]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
