// Kaffeetasse auf Holztisch: still (S02) und mit Erdbebenwellen auf der Oberfläche (S10).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, smooth, easeInOut, wobble, rng } from '../lib/util.js';

let scene, camera, cupGroup, coffeeMat, spoon, steam = [];
const U = { uTime: { value: 0 }, uAmp: { value: 0 }, uR: { value: 0.385 } };

function woodTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S), r = rng(3);
  const ph = Array.from({ length: 8 }, () => r() * 6.28);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const w = u + 0.0025 * Math.sin(v * 6.28 * 2 + ph[0]) + 0.0007 * Math.sin(v * 6.28 * 7 + ph[1] + u * 9);
    const lines = Math.pow(Math.sin(w * 520 + Math.sin(w * 31 + ph[2]) * 2.0) * 0.5 + 0.5, 6);
    const broad = Math.sin(w * 44 + Math.sin(v * 6.28 + ph[3]) * 0.6) * 0.5 + 0.5;
    const pu = (w * 4) % 1, gap = pu < 0.006 || pu > 0.994 ? 0.55 : 1.0;
    const plankTone = 0.92 + 0.12 * Math.sin(Math.floor(w * 4) * 12.9 + ph[4]);
    const k = (0.78 + 0.16 * broad - 0.2 * lines + (r() - 0.5) * 0.04) * gap * plankTone;
    const i = (y * S + x) * 4;
    img.data[i] = 96 * k; img.data[i + 1] = 60 * k; img.data[i + 2] = 37 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}

export async function init(ctx) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0806);
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  scene.fog = new THREE.Fog(0x0b0806, 5.5, 11);
  camera = new THREE.PerspectiveCamera(30, ctx.W / ctx.H, 0.05, 50);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);

  const sun = new THREE.DirectionalLight(0xffe2c0, 2.3); sun.position.set(-4, 3.2, -0.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
  scene.add(sun); scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a2410, 0.12));
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35); fill.position.set(3, 2, 3); scene.add(fill);

  cupGroup = new THREE.Group(); scene.add(cupGroup);
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xe6e0d6, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  // Untertasse
  const sp = [[0, 0.0], [0.44, 0.0], [0.55, 0.02], [0.68, 0.065], [0.7, 0.08], [0.68, 0.085], [0.53, 0.045], [0.42, 0.035], [0, 0.035]].map(([x, y]) => new THREE.Vector2(x, y));
  const saucer = new THREE.Mesh(new THREE.LatheGeometry(sp, 128), ceramic); saucer.castShadow = saucer.receiveShadow = true; cupGroup.add(saucer);
  // Tasse (Profil: innen hoch, Rand, außen runter)
  const cp = [[0, 0.12], [0.24, 0.12], [0.31, 0.16], [0.36, 0.28], [0.383, 0.45], [0.39, 0.7], [0.398, 0.722], [0.41, 0.725], [0.418, 0.71], [0.412, 0.5], [0.39, 0.32], [0.34, 0.15], [0.27, 0.07], [0.22, 0.04], [0.21, 0.035], [0, 0.035]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const cupMesh = new THREE.Mesh(new THREE.LatheGeometry(cp, 160), ceramic); cupMesh.castShadow = cupMesh.receiveShadow = true; cupGroup.add(cupMesh);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 24, 64, Math.PI * 1.25), ceramic);
  handle.position.set(0.47, 0.43, 0); handle.rotation.z = -Math.PI * 0.62; handle.castShadow = true; cupGroup.add(handle);
  // Löffel
  spoon = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.5, 8, 16), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.18 }));
  spoon.rotation.set(Math.PI / 2, 0, 0.9); spoon.scale.set(1, 1, 0.35); spoon.position.set(-0.32, 0.1, 0.5); spoon.castShadow = true; cupGroup.add(spoon);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), spoon.material); bowl.scale.set(1, 0.35, 1.5);
  bowl.position.set(-0.08, 0, 0.3); spoon.add(bowl);

  // Kaffee mit Wellen (Normalen-Störung im Shader) und Crema am Rand
  coffeeMat = new THREE.MeshPhysicalMaterial({ color: 0x1c0d05, roughness: 0.06, clearcoat: 0.6 });
  coffeeMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vL;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL=position.xy;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vL; uniform float uTime, uAmp, uR;
      float hgt(vec2 p){ float r=length(p)/uR; float k=38.0;
        return uAmp*(sin(k*r-uTime*11.0)*0.6+sin(k*r*1.7+uTime*7.0)*0.35+sin((p.x*0.8+p.y*0.6)/uR*24.0-uTime*9.0)*0.25)*(0.4+0.6*r); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float r=length(vL)/uR; float n=sin(vL.x*90.0)*sin(vL.y*80.0)*0.5+0.5;
        diffuseColor.rgb=mix(diffuseColor.rgb, vec3(0.42,0.24,0.11)*(0.85+0.3*n), smoothstep(0.78,0.98,r)*0.85); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { float e=0.002; float hx=(hgt(vL+vec2(e,0.0))-hgt(vL-vec2(e,0.0)))/(2.0*e); float hy=(hgt(vL+vec2(0.0,e))-hgt(vL-vec2(0.0,e)))/(2.0*e);
        vec3 nw=normalize(vec3(-hx,1.0,hy)); normal=normalize((viewMatrix*vec4(nw,0.0)).xyz); }`);
  };
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.386, 128), coffeeMat);
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.6; cupGroup.add(coffee);

  // Dampf: weiche, kaum sichtbare Schwaden
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const st = new THREE.CanvasTexture(c);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, opacity: 0.0, depthWrite: false }));
    scene.add(s); steam.push(s);
  }
}

export function frame(mode, lt, dur, t) {
  const p = lt / dur;
  let amp = 0, jit = 0;
  if (mode === 'ripple') {
    amp = 0.0022 * smooth(0.25, 0.9, lt) * (1 - smooth(2.6, 4.2, lt));
    jit = smooth(0.35, 0.8, lt) * (1 - smooth(2.4, 3.3, lt));
  }
  U.uTime.value = t; U.uAmp.value = amp;
  cupGroup.position.set(wobble(t * 1.7, 1) * 0.006 * jit, 0, wobble(t * 1.9, 5) * 0.006 * jit);
  cupGroup.rotation.y = 0.35 + wobble(t * 2.1, 9) * 0.012 * jit;
  spoon.position.y = 0.1 + Math.max(0, wobble(t * 2.6, 3)) * 0.01 * jit;

  steam.forEach((s, i) => {
    const ph = ((t * 0.18 + i / steam.length) % 1);
    s.position.set(Math.sin(i * 2.3 + t * 0.7) * 0.08 * ph, 0.65 + ph * 0.9, Math.cos(i * 1.7 + t * 0.5) * 0.08 * ph);
    s.scale.setScalar(0.12 + ph * 0.35); s.material.opacity = Math.sin(ph * Math.PI) * 0.022;
  });

  const push = mode === 'still' ? easeInOut(p) : easeInOut(smooth(0.5, 1, p));
  const d = lerp(5.2, 4.5, push);
  const az = mode === 'still' ? 0.55 : 0.45, el = mode === 'still' ? 0.62 : 0.72;
  camera.position.set(Math.sin(az) * Math.cos(el) * d, 0.45 + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(0, 0.42, 0);
  return { scene, camera, fx: { bloom: 0.25, bloomThreshold: 1.0, exposure: 0.85, vig: 0.75, warm: 1 } };
}
