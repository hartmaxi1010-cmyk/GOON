// Prozedurale europäische Altstadt mit Fluss: Traum vom Abheben (S03), Drohnenaufstieg (S05), Erdbeben (S09b).
import * as THREE from 'three';
import { clamp, lerp, smooth, easeInOut, easeOut, easeIn, wobble, rng } from '../lib/util.js';

let scene, camera, sky, sun, renderer, pmrem, envDay, envDusk;
let bld, roofs, cars, cabins, people, heads, blobs, dust, tl;
const lots = [], carData = [], personData = [], blobData = [];
const RIVER_Z0 = -150, RIVER_Z1 = -95;
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();

function makeSky() {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { hor: { value: new THREE.Color(0xd2c6b4) }, zen: { value: new THREE.Color(0x6f93c4) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color(1.0, 0.85, 0.65) } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 hor, zen, sunDir, sunCol; varying vec3 vD;
      void main(){ vec3 d=normalize(vD); float h=max(d.y,0.0);
        vec3 c=mix(hor, zen, pow(h,0.55)); float sd=max(dot(d,normalize(sunDir)),0.0);
        c+=sunCol*(pow(sd,900.0)*25.0+pow(sd,12.0)*0.35+pow(sd,3.0)*0.08);
        gl_FragColor=vec4(c,1.0); }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), m); mesh.frustumCulled = false; return mesh;
}

function prismGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5, -.5, 1, 0, .5, 1, 0];
  const idx = [0, 4, 5, 0, 5, 1, 2, 5, 4, 2, 4, 3, 3, 4, 0, 1, 5, 2];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}

function windowMaterial(params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 wpIM = mat4(1.0);
        #ifdef USE_INSTANCING
          wpIM = instanceMatrix;
        #endif
        vWP = (modelMatrix * wpIM * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * mat3(wpIM) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float winM = 0.0; vec3 an = abs(vWN);
        if (an.y < 0.5) {
          float u = an.x > an.z ? vWP.z : vWP.x;
          float fy = fract(vWP.y / 3.3); float fx = fract(u / 3.1);
          float win = step(0.3, fy) * step(fy, 0.78) * step(0.3, fx) * step(fx, 0.7) * step(3.4, vWP.y);
          float su = fract(u / 6.2);
          float shop = step(0.5, vWP.y) * step(vWP.y, 2.9) * step(0.12, su) * step(su, 0.88);
          winM = max(win, shop * 0.9);
          float sill = step(0.24, fy) * step(fy, 0.3) * step(0.27, fx) * step(fx, 0.73) * step(3.4, vWP.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.04, 0.05), winM * 0.9);
          diffuseColor.rgb *= 1.0 + sill * 0.25;
          diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(vWP.y / 3.3 + 0.1));
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, winM);');
  };
  return m;
}

export async function init(ctx) {
  renderer = ctx.renderer; tl = ctx.timeline;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, ctx.W / ctx.H, 0.5, 6000);
  sky = makeSky(); scene.add(sky);
  pmrem = new THREE.PMREMGenerator(renderer);
  const envFor = (elev, az, hor, zen) => {
    const sc = new THREE.Scene(); const sk = makeSky(); sc.add(sk);
    sk.material.uniforms.hor.value.setHex(hor); sk.material.uniforms.zen.value.setHex(zen);
    sk.material.uniforms.sunDir.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
    return pmrem.fromScene(sc).texture;
  };
  envDay = envFor(16, 200, 0xd2c6b4, 0x6f93c4); envDusk = envFor(4, 215, 0xb59a80, 0x4a5874);
  scene.fog = new THREE.FogExp2(0xcbb79c, 0.0011);

  sun = new THREE.DirectionalLight(0xffe0b8, 3.0); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xb9cff0, 0x5a4a3a, 0.55));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0x5d5a55, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, RIVER_Z1 - RIVER_Z0), new THREE.MeshStandardMaterial({ color: 0x24363f, roughness: 0.06, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, (RIVER_Z0 + RIVER_Z1) / 2); water.receiveShadow = true; scene.add(water);
  // Uferpromenade (helle Steinkante)
  for (const z of [RIVER_Z0 - 2, RIVER_Z1 + 2]) {
    const q = new THREE.Mesh(new THREE.BoxGeometry(8000, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x9a9283, roughness: 0.9 }));
    q.position.set(0, 0.3, z); q.receiveShadow = true; scene.add(q);
  }
  // Brücken
  for (const x of [-180, 40, 260]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, RIVER_Z1 - RIVER_Z0 + 8), new THREE.MeshStandardMaterial({ color: 0x8c8274, roughness: 0.85 }));
    b.position.set(x, 3.2, (RIVER_Z0 + RIVER_Z1) / 2); b.castShadow = b.receiveShadow = true; scene.add(b);
  }

  // Häuserblöcke
  const r = rng(11);
  const palette = [0xd9c9a8, 0xe8dcc4, 0xc9a77c, 0xb7836a, 0xe2d2b0, 0xcfc4b0, 0xa9b3a6, 0xe6c79a, 0xd8b8a0, 0xf0e6d2];
  const roofPal = [0x8a3b26, 0x9b4a2f, 0x6e3324, 0x4a4a50, 0x7a3a2a];
  const BW = 64, BD = 48, ST = 13;
  for (let i = -8; i <= 8; i++) for (let j = -7; j <= 9; j++) {
    const x0 = i * (BW + ST), z0 = j * (BD + ST);
    if (z0 < RIVER_Z1 + 8 && z0 + BD > RIVER_Z0 - 8) continue;      // Fluss freihalten
    if ((i === 1 && j === 1) || (i === 0 && j === 0)) continue;     // Plätze
    if ((i === -2 && j === 2) || (i === 3 && j === -4)) continue;    // Parks
    const edges = [[x0, z0, 1, 0, BW], [x0 + BW, z0, 0, 1, BD], [x0 + BW, z0 + BD, -1, 0, BW], [x0, z0 + BD, 0, -1, BD]];
    for (const [sx, sz, dx, dz, len] of edges) {
      let a = 0;
      while (a < len - 6) {
        const w = Math.min(len - a, 8 + r() * 9), d = 11 + r() * 4;
        const h = 11 + Math.floor(r() * 4) * 3.3 + (r() < 0.06 ? 6 : 0);
        const cx = sx + dx * (a + w / 2) + (-dz) * (d / 2), cz = sz + dz * (a + w / 2) + (dx) * (d / 2) * 1;
        lots.push({ x: cx, z: cz, w: dx !== 0 ? w : d, d: dx !== 0 ? d : w, h, rot: 0, col: palette[Math.floor(r() * palette.length)],
          roof: roofPal[Math.floor(r() * roofPal.length)], rh: 3 + r() * 3, ridgeX: dx !== 0, ph: r() * 6.28, sway: 0.4 + r() });
        a += w;
      }
    }
  }
  // Kirchturm am Platz
  const tower = { x: 1 * (BW + ST) + BW / 2, z: 1 * (BD + ST) + BD / 2 };
  const tw = new THREE.Mesh(new THREE.BoxGeometry(10, 52, 10), windowMaterial({ color: 0xbfae92, roughness: 0.9 }));
  tw.position.set(tower.x, 26, tower.z); tw.castShadow = tw.receiveShadow = true; scene.add(tw);
  const sp = new THREE.Mesh(new THREE.ConeGeometry(7.6, 22, 4), new THREE.MeshStandardMaterial({ color: 0x3e5a52, roughness: 0.6, metalness: 0.3 }));
  sp.position.set(tower.x, 63, tower.z); sp.rotation.y = Math.PI / 4; sp.castShadow = true; scene.add(sp);

  bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), windowMaterial({ color: 0xffffff, roughness: 0.88 }), lots.length);
  roofs = new THREE.InstancedMesh(prismGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), lots.length);
  bld.castShadow = bld.receiveShadow = roofs.castShadow = roofs.receiveShadow = true;
  const C = new THREE.Color();
  lots.forEach((l, k) => { bld.setColorAt(k, C.setHex(l.col)); roofs.setColorAt(k, C.setHex(l.roof)); });
  scene.add(bld, roofs);

  // Bäume (Parks + Ufer)
  const trees = [];
  for (const [px, pz, n] of [[-2 * (BW + ST), 2 * (BD + ST), 40], [3 * (BW + ST), -4 * (BD + ST), 40]])
    for (let k = 0; k < n; k++) trees.push([px + r() * BW, pz + r() * BD, 5 + r() * 4]);
  for (let x = -700; x < 700; x += 14) { trees.push([x + r() * 4, RIVER_Z1 + 6, 4 + r() * 2]); trees.push([x + r() * 4, RIVER_Z0 - 6, 4 + r() * 2]); }
  const tm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 0.95, flatShading: true }), trees.length);
  trees.forEach(([x, z, s], k) => { M.compose(V.set(x, s * 1.3, z), Q.identity(), S.set(s, s * 1.2, s)); tm.setMatrixAt(k, M); });
  tm.castShadow = tm.receiveShadow = true; scene.add(tm);

  // Autos auf den Straßen
  const nCars = 420;
  cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.3, 1.0, 1.8).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), nCars);
  cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.7, 1.6).translate(-0.2, 1.6, 0), new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.1, metalness: 0.6 }), nCars);
  const carPal = [0xb0b4ba, 0x1c1f24, 0xe9e9e9, 0x7a1d1d, 0x24375a, 0x4b4f55, 0xd8d2c4];
  for (let k = 0; k < nCars; k++) {
    const alongX = r() < 0.6; const lane = Math.floor(r() * 16) - 8; const dir = r() < 0.5 ? 1 : -1;
    const off = alongX ? lane * (BD + ST) - ST / 2 + dir * 2.4 : lane * (BW + ST) - ST / 2 + dir * 2.4;
    carData.push({ alongX, off, dir, speed: 8 + r() * 6, ph: r() * 1100, k });
    cars.setColorAt(k, C.setHex(carPal[Math.floor(r() * carPal.length)]));
  }
  cars.castShadow = cabins.castShadow = true; scene.add(cars, cabins);

  // Menschen (stilisierte Figuren) für die Traum-Einstellung
  const nP = 34;
  people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 1.0, 6, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), nP);
  heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8a68c, roughness: 0.7 }), nP);
  const coat = [0x2b3442, 0x6b3a2a, 0x8a8f96, 0x1e1e22, 0x9c7b52, 0x3f5a46, 0x7c2f37, 0xb9b2a4];
  for (let k = 0; k < nP; k++) {
    personData.push({ x: -5 + r() * 10, z: -8 - r() * 60, ph: r() * 6.28, lift: 0.7 + r() * 0.8, spin: (r() - 0.5) * 0.8, delay: r() * 0.8 });
    people.setColorAt(k, C.setHex(coat[Math.floor(r() * coat.length)]));
  }
  people.castShadow = heads.castShadow = true; scene.add(people, heads);

  // Wasserkugeln (Traum: „das Meer hebt ab")
  const nB = 160;
  blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x8fb3c4, roughness: 0.04, metalness: 0.0, clearcoat: 1, transparent: true, opacity: 0.75 }), nB);
  for (let k = 0; k < nB; k++) blobData.push({ x: -60 + r() * 120, z: RIVER_Z0 + 5 + r() * (RIVER_Z1 - RIVER_Z0 - 10), s: 0.3 + Math.pow(r(), 2) * 2.2, v: 0.6 + r() * 1.4, ph: r() * 6.28 });
  scene.add(blobs);

  // Staub (Erdbeben)
  const nD = 2600, pos = new Float32Array(nD * 3), seed = new Float32Array(nD * 3);
  for (let k = 0; k < nD; k++) { const l = lots[Math.floor(r() * lots.length)]; pos[3 * k] = l.x + (r() - 0.5) * 30; pos[3 * k + 2] = l.z + (r() - 0.5) * 30;
    seed[3 * k] = r(); seed[3 * k + 1] = r(); seed[3 * k + 2] = r(); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  dust = new THREE.Points(dg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: `attribute vec3 seed; uniform float uT, uA; varying float vA;
      void main(){ vec3 p=position; float t=max(0.0,uT-seed.x*0.8); p.y=t*(4.0+seed.y*10.0); p.x+=sin(t*0.7+seed.z*6.0)*t*2.0;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(30.0+seed.z*60.0)*(1.0+t*0.6)*(300.0/-mv.z);
        vA=uA*smoothstep(0.0,0.6,t)*(0.12+0.18*seed.y); }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=(1.0-smoothstep(0.2,1.0,d))*vA;
      gl_FragColor=vec4(vec3(0.6,0.52,0.42),a); }` }));
  dust.frustumCulled = false; scene.add(dust);
}

function setSun(elev, az, intensity, colorHex, hor = 0xd2c6b4, zen = 0x6f93c4) {
  sky.material.uniforms.hor.value.setHex(hor); sky.material.uniforms.zen.value.setHex(zen); scene.fog.color.setHex(hor);
  const v = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
  sky.material.uniforms.sunDir.value.copy(v); sky.position.copy(camera.position);
  sun.position.copy(v).multiplyScalar(800).add(camera.position.clone().setY(0)); sun.target.position.copy(camera.position).setY(0);
  sun.intensity = intensity; sun.color.setHex(colorHex);
}

function shadowBox(half) {
  const c = sun.shadow.camera; c.left = c.bottom = -half; c.right = c.top = half; c.near = 1; c.far = 2500; c.updateProjectionMatrix();
}

function updateCity(t, quake, collapse = 0) {
  lots.forEach((l, k) => {
    const sw = quake * l.sway;
    const col = l.sway > 1.22 ? easeIn(clamp(collapse * 1.4 - (l.ph / 6.28) * 0.4)) : 0; const rx = Math.sin(t * 9.0 + l.ph) * 0.012 * sw, rz = Math.sin(t * 7.3 + l.ph * 1.7) * 0.012 * sw;
    E.set(rx + col * 0.18 * Math.sin(l.ph), 0, rz + col * 0.22 * Math.cos(l.ph)); Q.setFromEuler(E);
    M.compose(V.set(l.x, -quake * 0.15 * l.sway * (0.5 + 0.5 * Math.sin(t * 13 + l.ph)) - col * l.h * 0.7, l.z), Q, S.set(l.w, Math.max(0.01, l.h), l.d)); bld.setMatrixAt(k, M);
    const q2 = Q.clone(); if (!l.ridgeX) q2.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    const top = new THREE.Vector3(0, l.h, 0).applyQuaternion(Q);
    M.compose(V.set(l.x + top.x, top.y - col * l.h * 0.7, l.z + top.z), q2, l.ridgeX ? S.set(l.w, l.h > 0 ? l.rh : 0.001, l.d) : S.set(l.d, l.h > 0 ? l.rh : 0.001, l.w));
    roofs.setMatrixAt(k, M);
  });
  bld.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
}

function updateCars(t, floatAmt = 0, lt = 0) {
  carData.forEach((c) => {
    const s = ((c.ph + c.dir * c.speed * t) % 1100 + 1100) % 1100 - 550;
    let x = c.alongX ? s : c.off, z = c.alongX ? c.off : s, y = 0;
    E.set(0, c.alongX ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
    if (floatAmt > 0) { const f = Math.max(0, lt - (c.ph % 0.8)); y = floatAmt * f * f * 0.9; E.x += f * 0.15 * Math.sin(c.ph); E.z += f * 0.12 * Math.cos(c.ph); }
    Q.setFromEuler(E); M.compose(V.set(x, y, z), Q, S.set(1, 1, 1)); cars.setMatrixAt(c.k, M); cabins.setMatrixAt(c.k, M);
  });
  cars.instanceMatrix.needsUpdate = cabins.instanceMatrix.needsUpdate = true;
}

function hideMovers(p, b) {
  people.visible = heads.visible = p; blobs.visible = b;
}

export function frame(mode, lt, dur, t) {
  const p = lt / dur;
  const fx = { bloom: 0.25, bloomThreshold: 0.95, exposure: 0.9, vig: 0.5, warm: 0.6 };
  dust.material.uniforms.uA.value = 0;
  scene.fog.density = 0.0011;
  let quake = 0;

  if (mode === 'dream_people' || mode === 'dream_coast') {
    scene.environment = envDay; scene.environmentIntensity = 0.8;
    hideMovers(mode === 'dream_people', mode === 'dream_coast'); cars.visible = cabins.visible = true;
    if (mode === 'dream_people') {
      // Straßenebene in einer Gasse; Figuren heben langsam ab (= der verbreitete Irrtum)
      const cx = -1 * 77 - 6.5, cz = 2 * 61 + 20;
      camera.position.set(cx + lerp(0, 0.6, p), lerp(1.7, 3.2, easeInOut(p)), cz + 6);
      camera.lookAt(cx + 0.5, lerp(2.6, 6.0, easeInOut(p)), cz - 40);
      personData.forEach((d, k) => {
        const f = Math.max(0, lt - d.delay); const y = d.lift * 0.45 * f * f;
        E.set(f * d.spin * 0.3, d.ph + f * d.spin, f * d.spin * 0.25); Q.setFromEuler(E);
        M.compose(V.set(cx + d.x, 0.74 + y, cz + d.z * 0.6), Q, S.set(1, 1, 1)); people.setMatrixAt(k, M);
        const hp = new THREE.Vector3(0, 0.85, 0).applyQuaternion(Q);
        M.compose(V.set(cx + d.x + hp.x, 0.74 + y + hp.y, cz + d.z * 0.6 + hp.z), Q, S.set(1, 1, 1)); heads.setMatrixAt(k, M);
      });
      people.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
      shadowBox(90);
      cars.visible = cabins.visible = false;
    } else {
      // Ufer: Wasserkugeln steigen aus dem Fluss, Autos auf der Uferstraße heben ab
      camera.position.set(lerp(-9, -4, p), lerp(17, 21, easeInOut(p)), RIVER_Z1 + 22);
      camera.lookAt(15, lerp(6, 14, easeInOut(p)), RIVER_Z0 - 10);
      blobData.forEach((b, k) => {
        const f = Math.max(0, lt - b.ph * 0.12); const y = b.v * f * f * 0.9 - b.s * 0.5;
        const wob = 1 + 0.08 * Math.sin(t * 3 + b.ph);
        M.compose(V.set(b.x, y, b.z), Q.identity(), S.set(b.s * wob, b.s / wob, b.s * wob)); blobs.setMatrixAt(k, M);
      });
      blobs.instanceMatrix.needsUpdate = true;
      shadowBox(150);
      updateCars(t, 0.6, lt);
    }
    setSun(16, mode === 'dream_people' ? 125 : 200, 3.0, 0xffe2bd);
    updateCity(t, 0);
    Object.assign(fx, { desat: 0.35, soft: 0.55, bloom: 0.45, bloomThreshold: 0.85, bloomRadius: 0.7, exposure: 0.85, vig: 0.7, warm: 0.4 });
    // harter Schnitt ins Schwarz am Ende von S03 („So läuft das aber nicht.")
    if (mode === 'dream_coast') fx.fade = smooth(dur - 0.42, dur - 0.3, lt);
  } else if (mode === 'rise') {
    scene.environment = envDay; scene.environmentIntensity = 0.7; hideMovers(false, false); cars.visible = cabins.visible = true;
    const e = easeInOut(p);
    camera.position.set(-40, lerp(55, 240, e), 240 - e * 40);
    camera.lookAt(20, lerp(10, 0, e), lerp(40, -60, e));
    setSun(16, 200, 3.0, 0xffe2bd); shadowBox(520);
    updateCity(t, 0); updateCars(t);
    Object.assign(fx, { exposure: 0.95, warm: 0.7 });
  } else if (mode === 'quake') {
    scene.environment = envDusk; scene.environmentIntensity = 0.5; hideMovers(false, false); cars.visible = cabins.visible = true;
    quake = 0.6 + 0.4 * Math.sin(p * Math.PI);
    const sh = 1.6 * quake;
    camera.position.set(-90 + wobble(t * 1.3, 1) * sh, 95 + wobble(t * 1.1, 3) * sh, 260 - p * 25 + wobble(t * 1.2, 5) * sh);
    camera.lookAt(30 + wobble(t * 0.9, 7) * sh * 0.5, 15, -40);
    setSun(4, 215, 2.2, 0xffa868, 0xb59a80, 0x4a5874); shadowBox(520);
    scene.fog.density = 0.0018 + p * 0.0012;
    updateCity(t, quake, p); updateCars(t);
    dust.material.uniforms.uT.value = lt + 0.6; dust.material.uniforms.uA.value = 1.0;
    Object.assign(fx, { exposure: 0.85, warm: 1, bloom: 0.35, vig: 0.7 });
  }
  return { scene, camera, fx };
}
