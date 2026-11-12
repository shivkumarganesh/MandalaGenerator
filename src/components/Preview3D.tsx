// three.js preview of the stack. It consumes the same BuiltLayer[] as the 2D canvas and the
// exporters (via lib/mesh.slab) — there is no second geometry pipeline here.
//
// Space: IR is mm, Y down. three.js is mm, Y up, Z = thickness. The flip happens ONCE:
// content.scale.y = -1. Meshes never flip themselves and geometry is never flipped.
import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildStack } from '../lib/build';
import { bbox } from '../lib/geom';
import { slab } from '../lib/mesh';
import type { BuiltLayer, Design } from '../lib/types';
import { useStore } from '../lib/store';
import type { ZoomApi } from './panzoom';

const GRAIN_MM = 45; // one tile of the grain texture spans this many mm

function grainTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const y = rnd() * 256, len = 40 + rnd() * 216, x = rnd() * 256, a = 0.02 + rnd() * 0.05;
    g.strokeStyle = `rgba(60,35,10,${a})`; g.lineWidth = 0.4 + rnd() * 1.0;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len / 3, y + rnd() * 3 - 1.5, x + (2 * len) / 3, y + rnd() * 3 - 1.5, x + len, y + rnd() * 2 - 1); g.stroke();
    if (x + len > 256) { g.beginPath(); g.moveTo(x - 256, y); g.lineTo(x + len - 256, y); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / GRAIN_MM, 1 / GRAIN_MM);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function layerGeometry(l: BuiltLayer, h: number): THREE.BufferGeometry {
  const s = slab(l.shapes, 0, h);
  const pos = new Float32Array(s.caps.length + s.sides.length);
  pos.set(s.caps, 0); pos.set(s.sides, s.caps.length);
  const uv = new Float32Array((pos.length / 3) * 2);
  const nCap = s.caps.length / 3;
  for (let i = 0; i < pos.length / 3; i++) {
    // UVs are world mm, so the grain keeps its physical size when the part is resized
    if (i < nCap) { uv[i * 2] = pos[i * 3]; uv[i * 2 + 1] = pos[i * 3 + 1]; }
    else { uv[i * 2] = pos[i * 3] + pos[i * 3 + 1]; uv[i * 2 + 1] = pos[i * 3 + 2]; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.addGroup(0, nCap, 0); // faces
  g.addGroup(nCap, s.sides.length / 3, 1); // cut edges
  g.computeVertexNormals();
  return g;
}

export default function Preview3D({ zoomRef, onPct }: { zoomRef: MutableRefObject<ZoomApi | null>; onPct: (p: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const design = useStore((s) => s.design);
  const explode = useStore((s) => s.ui.explode);
  const api = useRef<{ rebuild: (d: Design, explode: number) => void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment()); // built once, disposed on unmount
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.4;
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);

    const camera = new THREE.PerspectiveCamera(36, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.95;
    controls.enablePan = false;

    const rig = new THREE.Group(); // ambient motion lives here; rebuilds never touch it
    const content = new THREE.Group();
    content.scale.y = -1; // the one IR → three.js flip
    rig.add(content); scene.add(rig);
    const grain = grainTexture(); // shared across rebuilds

    let R = 100, framedR = 0, defaultDist = 320;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const frame = () => {
      defaultDist = R * 3.5;
      const az = 0.42, elv = 0.36; // slightly from the side, tilted down
      camera.position.set(Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)).multiplyScalar(defaultDist);
      controls.target.set(0, 0, 0);
      controls.update();
    };

    const built: { geo: THREE.BufferGeometry; mats: THREE.Material[] }[] = [];
    const disposeBuilt = () => { built.forEach((b) => { b.geo.dispose(); b.mats.forEach((m) => m.dispose()); }); built.length = 0; content.clear(); };

    api.current = {
      rebuild(d, ex) {
        disposeBuilt();
        const stack = buildStack(d);
        const bb = bbox(stack.flatMap((l) => l.shapes));
        if (!bb) return;
        const print = d.finish === 'plastic';
        const hs = stack.map((l) => (print ? (l.isPlate ? d.print.base : d.print.layer) : d.thickness));
        const total = hs.reduce((a, b) => a + b, 0);
        R = Math.max(Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2, 20);
        const gap = ex * R * 0.22;
        let z = -(total + gap * (stack.length - 1)) / 2;
        stack.forEach((l, i) => {
          const geo = layerGeometry(l, hs[i]);
          const col = new THREE.Color(l.color);
          const wood = d.finish === 'wood';
          const face = new THREE.MeshStandardMaterial({
            color: col, roughness: wood ? 0.78 : print ? 0.42 : 0.6, metalness: 0,
            map: wood ? grain : null, bumpMap: grain, bumpScale: wood ? 0.35 : 0.1,
          });
          // cut edges: laser-charred on wood, a shade darker otherwise
          const side = new THREE.MeshStandardMaterial({
            color: wood ? col.clone().multiplyScalar(0.42).lerp(new THREE.Color('#2a1a0e'), 0.35) : col.clone().multiplyScalar(0.72),
            roughness: 0.85, metalness: 0,
          });
          const mesh = new THREE.Mesh(geo, [face, side]);
          mesh.position.z = z;
          mesh.castShadow = true; mesh.receiveShadow = true;
          content.add(mesh);
          built.push({ geo, mats: [face, side] });
          z += hs[i] + gap;
        });
        sun.position.set(-R * 1.1, R * 1.6, R * 2.4);
        const sc = sun.shadow.camera;
        sc.left = sc.bottom = -R * 1.5; sc.right = sc.top = R * 1.5; sc.near = 1; sc.far = R * 8;
        sc.updateProjectionMatrix();
        controls.minDistance = R * 1.2; controls.maxDistance = R * 8;
        camera.near = R * 0.05; camera.far = R * 40; camera.updateProjectionMatrix();
        // ordinary edits leave the camera alone; only a clearly different size (a new design or layout) re-frames it
        if (!framedR || Math.abs(R - framedR) > framedR * 0.15) { framedR = R; frame(); }
      },
    };

    zoomRef.current = {
      zoomBy: (f) => { const dir = camera.position.clone().sub(controls.target); const dist = THREE.MathUtils.clamp(dir.length() / f, controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(dir.setLength(dist)); },
      zoomTo: (pct) => { const dir = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).add(dir.setLength(THREE.MathUtils.clamp(defaultDist / (pct / 100), controls.minDistance, controls.maxDistance))); },
      fit: frame,
    };
    let lastPct = -1;
    const report = () => {
      const pct = Math.round(((defaultDist / camera.position.distanceTo(controls.target)) * 100) / 5) * 5;
      if (pct !== lastPct) { lastPct = pct; onPct(pct); }
    };
    controls.addEventListener('change', report);

    // under-damped spring: dragging nudges the rig, releasing overshoots once and settles
    const spring = { x: 0, y: 0, vx: 0, vy: 0 };
    let dragging = false, px = 0, py = 0;
    const pd = (e: PointerEvent) => { dragging = true; px = e.clientX; py = e.clientY; };
    const pm = (e: PointerEvent) => {
      if (!dragging || reduce.matches) return;
      spring.vy += (e.clientX - px) * 0.012; spring.vx += (e.clientY - py) * 0.012;
      px = e.clientX; py = e.clientY;
    };
    const pu = () => { dragging = false; };
    renderer.domElement.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w === 0 || h === 0) return; // hidden tab / collapsed panel: keep the current view
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    let raf = 0, prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (reduce.matches) { rig.rotation.set(0, 0, 0); }
      else {
        const k = 70, c = 5.5;
        spring.vx += (-k * spring.x - c * spring.vx) * dt; spring.vy += (-k * spring.y - c * spring.vy) * dt;
        spring.x += spring.vx * dt; spring.y += spring.vy * dt;
        const t = now / 1000; // Lissajous sway on non-commensurate frequencies: no visible loop point
        rig.rotation.x = Math.sin(t * 0.53) * 0.02 + THREE.MathUtils.clamp(spring.x, -0.25, 0.25);
        rig.rotation.y = Math.sin(t * 0.37 + 1.3) * 0.03 + THREE.MathUtils.clamp(spring.y, -0.25, 0.25);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener('change', report);
      renderer.domElement.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu);
      disposeBuilt();
      grain.dispose(); envRT.dispose(); pmrem.dispose();
      controls.dispose(); renderer.dispose();
      renderer.domElement.remove();
      zoomRef.current = null; api.current = null;
    };
  }, [zoomRef, onPct]);

  // debounced rebuild, scoped to the content group; the first one is immediate
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; api.current?.rebuild(design, explode); return; }
    const t = setTimeout(() => api.current?.rebuild(design, explode), 140);
    return () => clearTimeout(t);
  }, [design, explode]);

  return <div ref={host} className="gen-canvas-stage stage-3d" />;
}
