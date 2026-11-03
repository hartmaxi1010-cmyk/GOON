// Ball-Experiment (S06): Im Inertialsystem fliegt der Ball geradeaus, der Boden beschleunigt ihm entgegen.
// Danach: Kamera „steigt" mit dem Boden – aus Sicht des Werfers ist es der gewohnte Bogen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, lerp, smooth, easeInOut, easeOut } from '../lib/util.js';

let scene, camera, groundG, ball, ballShadow, trail, ghost, puff, arm, tl, grid;
const A = 1.0, H0 = 1.55, VX = 1.12, VY = 1.35, X0 = -1.85;          // Simulationsparameter
const TL = (VY + Math.sqrt(VY * VY + 2 * A * H0)) / A;               // Flugzeit bis Landung
const NT = 160;

function soilTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512; const g = c.getContext('2d');
  for (let y = 0; y < 512; y++) { const k = 0.75 + 0.18 * Math.sin(y * 0.11) + 0.07 * Math.sin(y * 0.53 + 1.3);
    g.fillStyle = `rgb(${Math.round(92 * k)},${Math.round(66 * k)},${Math.round(44 * k)})`; g.fillRect(0, y, 64, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function init(ctx) {
  tl = ctx.timeline;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0d12);
  scene.environment = new THREE.PMREMGenerator(ctx.renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.25;
  camera = new THREE.PerspectiveCamera(21, ctx.W / ctx.H, 1, 200);

  // feststehendes Referenzgitter (= Raum, nicht Boden)
  grid = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vW; void main(){ vec2 g=abs(fract(vW.xy+0.5)-0.5)/fwidth(vW.xy); float l=1.0-min(min(g.x,g.y),1.0);
      vec2 g5=abs(fract(vW.xy/5.0+0.5)-0.5)/fwidth(vW.xy/5.0); float l5=1.0-min(min(g5.x,g5.y),1.0);
      gl_FragColor=vec4(vec3(0.35,0.6,0.85),l*0.10+l5*0.18); }` }));
  grid.position.z = -4; scene.add(grid);

  const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-6, 10, 8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 12, bottom: -6, near: 1, far: 40 });
  scene.add(key, key.target); scene.add(new THREE.HemisphereLight(0x9fb8d8, 0x302418, 0.5));
  const rim = new THREE.DirectionalLight(0x88b8ff, 1.2); rim.position.set(6, 3, -6); scene.add(rim);

  // Boden als Schnitt-Diorama: Gras + Erdschichten
  groundG = new THREE.Group(); scene.add(groundG);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 3), new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 0.95 }));
  soil.position.y = -2.1; soil.receiveShadow = true;
  const grass = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 3), new THREE.MeshStandardMaterial({ color: 0x4e7a34, roughness: 0.9 }));
  grass.position.y = -0.1; grass.receiveShadow = true;
  groundG.add(soil, grass);
  // Werfer (stilisierte Figur)
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f3d52, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.95, 8, 16), mat); body.position.set(-2.35, 0.72, 0); body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc9a487, roughness: 0.6 }));
  head.position.set(-2.35, 1.6, 0); head.castShadow = true;
  arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 6, 12).translate(0, 0.3, 0), mat); arm.position.set(-2.25, 1.32, 0.05); arm.castShadow = true;
  groundG.add(body, head, arm);

  ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 24), new THREE.MeshStandardMaterial({ color: 0xd8e84a, roughness: 0.65, emissive: 0x161a00 }));
  ball.castShadow = true; scene.add(ball);
  ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);

  const mk = (col, size) => { const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NT * 3), 3)),
    new THREE.PointsMaterial({ color: col, size, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); pts.frustumCulled = false; scene.add(pts); return pts; };
  trail = mk(new THREE.Color(0.5, 1.6, 2.4), 5);          // gerade Bahn im Raum (cyan)
  ghost = mk(new THREE.Color(2.4, 1.3, 0.45), 5);         // gewohnter Bogen relativ zum Boden (orange)

  puff = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3)),
    new THREE.PointsMaterial({ color: 0xb59b7c, size: 7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  puff.frustumCulled = false; scene.add(puff);
}

export function frame(mode, lt, dur, t, sh) {
  const S = tl.sentences.filter(x => x.scene === 's06_ball');
  const tLand = (S[1] ? S[1].start + 0.35 : sh.start + 3.6) - sh.start;   // Landung auf „Landen tut er trotzdem"
  const tRel = 0.45, k = (tLand - tRel) / TL;                          // Echtzeit -> Simulationszeit
  const tau = clamp((lt - tRel) / k, 0, 99);
  const tauB = Math.min(tau, TL);
  const gy = 0.5 * A * tau * tau;                                       // Bodenhöhe (läuft auch nach der Landung weiter)
  groundG.position.y = gy;

  // Wurfbewegung des Arms
  const swing = smooth(0.0, tRel, lt);
  arm.rotation.z = lerp(0.6, -0.9, easeOut(swing));

  // Ball: vor dem Wurf in der Hand, dann geradlinig; nach der Landung liegt er auf dem Boden
  const hand = new THREE.Vector3(-2.25 - Math.sin(arm.rotation.z) * 0.62, 1.32 + Math.cos(arm.rotation.z) * 0.62, 0.05);
  let bx, by;
  if (lt < tRel) { bx = hand.x; by = hand.y + gy; }
  else if (tau < TL) { bx = X0 + VX * tauB; by = H0 + VY * tauB; }
  else { const roll = Math.min(0.35, (tau - TL) * 0.25); bx = X0 + VX * TL + roll; by = gy + 0.12; }
  ball.position.set(bx, Math.max(by, gy + 0.12), 0);
  ball.rotation.z = -tauB * 3;
  ballShadow.position.set(bx, gy + 0.005, 0.2);
  const hAbove = ball.position.y - gy; ballShadow.material.opacity = 0.35 * clamp(1 - hAbove / 6); ballShadow.scale.setScalar(1 + hAbove * 0.25);

  // Spuren
  const tp = trail.geometry.attributes.position.array, gp = ghost.geometry.attributes.position.array;
  const nT = Math.round(NT * clamp(tauB / TL)), ghostP = smooth(tLand + 0.6, tLand + 1.8, lt), nG = Math.round(NT * ghostP);
  for (let i = 0; i < NT; i++) {
    const s = TL * i / (NT - 1) * clamp(tauB / TL);
    tp[3 * i] = X0 + VX * s; tp[3 * i + 1] = H0 + VY * s; tp[3 * i + 2] = 0.3;
    const s2 = TL * i / (NT - 1); // Bahn relativ zum Boden: H0 + VY s - A s²/2 (+ aktuelle Bodenhöhe)
    gp[3 * i] = X0 + VX * s2; gp[3 * i + 1] = gy + H0 + VY * s2 - 0.5 * A * s2 * s2; gp[3 * i + 2] = 0.32;
  }
  trail.geometry.setDrawRange(0, lt > tRel ? NT : 0); trail.geometry.attributes.position.needsUpdate = true;
  ghost.geometry.setDrawRange(0, nG); ghost.geometry.attributes.position.needsUpdate = true;
  trail.material.opacity = lt > tRel ? 0.95 * (1 - 0.6 * ghostP) : 0;
  ghost.material.opacity = 0.95;

  // Staubwolke bei der Landung
  const pa = puff.geometry.attributes.position.array, since = lt - tLand;
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI, sp = 0.4 + (i * 37 % 11) / 11;
    pa[3 * i] = bx + Math.cos(a) * sp * Math.max(0, since) * 0.8; pa[3 * i + 1] = gy + 0.05 + Math.sin(a) * sp * Math.max(0, since) * 0.35; pa[3 * i + 2] = 0.25; }
  puff.geometry.attributes.position.needsUpdate = true; puff.material.opacity = since > 0 ? 0.7 * Math.exp(-since * 2.2) : 0;

  // Kamera: erst fest im Raum, nach der Landung fährt sie mit dem Boden mit
  const follow = smooth(tLand - 0.5, tLand + 0.7, lt);
  const camY = lerp(3.0, gy + 2.2, follow);
  camera.position.set(-0.1, camY + 0.6, 34); camera.lookAt(-0.1, camY, 0);
  return { scene, camera, fx: { bloom: 0.6, bloomThreshold: 0.9, exposure: 1.0, vig: 0.6 } };
}
