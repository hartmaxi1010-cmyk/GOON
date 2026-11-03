// Erde im All: Sonnenaufgang (Hook), Satelliten, GPS, Rückkehr der Schwerkraft, Risse in der Kruste.
import * as THREE from 'three';
import { NOISE } from '../lib/glsl.js';
import { clamp, lerp, smooth, easeInOut, easeOut, wobble, latLon, rng } from '../lib/util.js';

let scene, camera, earthGroup, earth, earthMat, crackMat, clouds, atmo, ghost, sun, stars, ring, gpsGroup, sats = [], tl;
const SUN = new THREE.Vector3();

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const earthVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){ vUv=uv; vObj=position; vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz;
gl_Position=projectionMatrix*viewMatrix*wp; }`;

const earthFS = `uniform sampler2D dayTex, nightTex, waterTex; uniform vec3 sunDir; uniform float uCrack, uTime, uNight, uDay, uAmb, uDusk;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
${NOISE}
void main(){
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vP); float ndl=dot(N,sunDir);
  float day=smoothstep(-0.12,0.22,ndl);
  vec3 dc=texture2D(dayTex,vUv).rgb; float water=texture2D(waterTex,vUv).r; vec3 nc=texture2D(nightTex,vUv).rgb;
  vec3 col=dc*(max(ndl,0.0)*0.95*uDay+uAmb);
  vec3 Hh=normalize(sunDir+V); float sp=pow(max(dot(N,Hh),0.0),70.0)*water*step(0.0,ndl);
  col+=vec3(1.0,0.86,0.68)*sp*0.9*uDay;
  // Dämmerungssaum
  col+=vec3(1.0,0.45,0.18)*exp(-pow(ndl*14.0,2.0))*0.01*uDusk;
  col+=nc*nc*pow(1.0-day,2.0)*uNight*vec3(1.0,0.78,0.5);
  float fres=pow(1.0-max(dot(N,V),0.0),3.0);
  col=mix(col,vec3(0.32,0.58,1.0)*max(ndl,0.0)*1.1,fres*0.6);
  #ifdef CRACKS
  if(uCrack>0.0){
    vec3 o=normalize(vObj);
    float e1=voronoiEdge(o*6.0+1.7); float e2=voronoiEdge(o*17.0+5.3);
    float w1=0.005+0.02*uCrack; float w2=0.008*smoothstep(0.35,1.0,uCrack);
    float c=(1.0-smoothstep(0.0,w1,e1))*smoothstep(0.0,0.25,uCrack)+(1.0-smoothstep(0.0,w2,e2))*0.7;
    float fl=0.75+0.25*snoise(o*9.0+uTime*2.0);
    col*=1.0-0.2*uCrack;
    col+=vec3(1.0,0.32,0.06)*c*fl*1.7;
    col+=vec3(1.0,0.4,0.1)*(1.0-smoothstep(0.0,w1*4.0,e1))*0.08*uCrack;
  }
  #endif
  gl_FragColor=vec4(col,1.0);
}`;

const cloudFS = `uniform sampler2D cloudTex; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){ vec3 N=normalize(vN); float ndl=dot(N,sunDir); float a=texture2D(cloudTex,vUv).r;
  vec3 c=vec3(1.0)*(max(ndl,0.0)*0.95+0.004) + vec3(1.0,0.5,0.25)*exp(-pow(ndl*12.0,2.0))*0.015;
  gl_FragColor=vec4(c,smoothstep(0.08,0.9,a)*0.85); }`;

const atmoFS = `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP; varying vec2 vUv; varying vec3 vObj;
void main(){ vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vP); float f=1.0-max(dot(N,V),0.0);
  float s=smoothstep(-0.35,0.6,dot(N,sunDir));
  float i=pow(f,5.0)*(0.02+2.4*s);
  vec3 c=mix(vec3(1.0,0.5,0.25),vec3(0.3,0.6,1.0),smoothstep(-0.4,0.0,dot(N,sunDir)));
  gl_FragColor=vec4(c*i,1.0); }`;

export async function init(ctx) {
  tl = ctx.timeline;
  const L = (f, srgb = true) => new Promise(r => ctx.loader.load('./tex/' + f, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 1; r(t); }));
  const [day, night, water, cl, sky] = await Promise.all([L('earth-blue-marble.jpg'), L('earth-night.jpg'), L('earth-water.png', false),
    L('clouds_alpha.jpg', false), L('night-sky.png')]);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(32, ctx.W / ctx.H, 0.01, 200);

  stars = new THREE.Mesh(new THREE.SphereGeometry(80, 64, 32), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, color: new THREE.Color(0.55, 0.55, 0.6) }));
  scene.add(stars);

  earthGroup = new THREE.Group(); scene.add(earthGroup);
  const geo = new THREE.SphereGeometry(1, 256, 128);
  const eu = { dayTex: { value: day }, nightTex: { value: night }, waterTex: { value: water }, sunDir: { value: SUN },
      uCrack: { value: 0 }, uTime: { value: 0 }, uNight: { value: 2.2 }, uDay: { value: 1 }, uAmb: { value: 0.003 }, uDusk: { value: 1 } };
  earthMat = new THREE.ShaderMaterial({ vertexShader: earthVS, fragmentShader: earthFS, uniforms: eu });
  crackMat = new THREE.ShaderMaterial({ vertexShader: earthVS, fragmentShader: earthFS, uniforms: eu, defines: { CRACKS: 1 } });
  earth = new THREE.Mesh(geo, earthMat);
  earthGroup.add(earth);
  clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 192, 96), new THREE.ShaderMaterial({ vertexShader: earthVS, fragmentShader: cloudFS,
    uniforms: { cloudTex: { value: cl }, sunDir: { value: SUN } }, transparent: true, depthWrite: false }));
  earthGroup.add(clouds);
  atmo = new THREE.Mesh(new THREE.SphereGeometry(1.014, 192, 96), new THREE.ShaderMaterial({ vertexShader: earthVS, fragmentShader: atmoFS,
    uniforms: { sunDir: { value: SUN } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(atmo);

  // Referenzgitter: ursprünglicher Erdradius (zeigt die Ausdehnung)
  ghost = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1.0, 36, 18)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(0.25, 0.75, 1.0), transparent: true, opacity: 0.0, depthWrite: false }));
  scene.add(ghost);

  sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; void main(){ float r=length(vUv-0.5)*2.0;
      vec3 c=vec3(1.0,0.97,0.9)*(exp(-r*r*1400.0)*5.0) + vec3(1.0,0.78,0.5)*exp(-r*r*120.0)*0.9 + vec3(1.0,0.6,0.35)*exp(-r*9.0)*0.25;
      c*=1.0-smoothstep(0.85,1.0,r); gl_FragColor=vec4(c,1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sun.scale.set(30, 30, 1); scene.add(sun);

  ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 256), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.8),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(ring);

  // Satelliten
  const r = rng(7);
  const glow = radialTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(160,230,255,0.6)'], [1, 'rgba(0,0,0,0)']]);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.026), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.35 }));
    const pm = new THREE.MeshStandardMaterial({ color: 0x1b2a55, metalness: 0.6, roughness: 0.3, emissive: 0x0a1430 });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.018), pm); p1.position.x = 0.036;
    const p2 = p1.clone(); p2.position.x = -0.036;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.2, 3, 4), blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(0.13, 0.13, 1);
    g.add(body, p1, p2, s); scene.add(g);
    const radius = 1.32 + i * 0.09 + r() * 0.04;
    const n = new THREE.Vector3(r() - 0.5, 1.6, r() - 0.5).normalize().applyAxisAngle(new THREE.Vector3(0, 0, 1), (r() - 0.5) * 2.2);
    const u = new THREE.Vector3(1, 0, 0).cross(n).normalize(); const v = n.clone().cross(u).normalize();
    const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, k) => {
      const a = k / 256 * Math.PI * 2; return u.clone().multiplyScalar(Math.cos(a) * radius).add(v.clone().multiplyScalar(Math.sin(a) * radius)); })),
      new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.8, 1.2), transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(orbit);
    const trail = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 200), 3)),
      new THREE.PointsMaterial({ color: new THREE.Color(3.0, 1.5, 0.5), size: 4, sizeAttenuation: false, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(trail);
    sats.push({ g, orbit, trail, radius, u, v, a0: r() * Math.PI * 2, w: 0.32 / Math.pow(radius, 1.5) * (r() < 0.5 ? 1 : -1) });
  }

  // GPS-Markierung über Deutschland
  gpsGroup = new THREE.Group();
  const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(4, 3, 1.5), blending: THREE.AdditiveBlending, depthWrite: false }));
  pin.scale.set(0.05, 0.05, 1);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 12).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.0), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 0.8),
    transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const base = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(0.8, 2.2, 3.5), blending: THREE.AdditiveBlending, depthWrite: false }));
  base.scale.set(0.03, 0.03, 1);
  gpsGroup.add(pin, beam, pulse, base); gpsGroup.userData = { pin, beam, pulse, base };
  earthGroup.add(gpsGroup);
}

// Erde so drehen, dass Ort (lat, lon) in Weltrichtung dir zeigt
function orient(lat, lon, dir, spin = 0) {
  const o = new THREE.Vector3(...latLon(lat, lon)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(o, dir.clone().normalize());
  const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin);
  earthGroup.quaternion.copy(q).multiply(qs);
}

function voiceEvent(sceneId, idx = 0, back = 0.4) {
  const s = tl.sentences.filter(x => x.scene === sceneId)[idx]; return s.end - back;
}

export function frame(mode, lt, dur, t) {
  const H = new URLSearchParams(location.search).get('hide') || '';
  const p = lt / dur;
  const fx = { bloom: 0.55, bloomThreshold: 0.85, bloomRadius: 0.6, exposure: 1.0 };
  earth.material = earthMat; earth.material.uniforms.uTime.value = t; earth.material.uniforms.uCrack.value = 0;
  earth.material.uniforms.uNight.value = 2.2; earth.material.uniforms.uDay.value = 1; earth.material.uniforms.uAmb.value = 0.003; earth.material.uniforms.uDusk.value = 1;
  clouds.rotation.y = t * 0.004;
  earthGroup.scale.setScalar(1); atmo.scale.setScalar(1); ghost.material.opacity = 0; ring.material.opacity = 0;
  sun.visible = true; gpsGroup.visible = false;
  for (const s of sats) { s.g.visible = s.orbit.visible = s.trail.visible = false; }
  camera.up.set(0, 1, 0); camera.fov = 32;

  if (mode === 'sunrise') {
    // Kamera nah an der Erde, Sonne geht hinter dem Horizont auf; Europa im Morgengrauen
    SUN.set(0.08, lerp(0.50, 0.76, easeInOut(p)), -1).normalize();
    orient(50, 9, new THREE.Vector3(0.0, 0.55, 0.83), 0);
    earthGroup.rotateY(t * 0.01);
    const d = lerp(1.86, 1.79, easeInOut(p));
    camera.position.set(0, 0.05, d); camera.lookAt(0, 0.9, 0); camera.rotateZ(0.05);
    sun.position.copy(SUN).multiplyScalar(60);
    earth.material.uniforms.uNight.value = 4.0; earth.material.uniforms.uAmb.value = 0.012; earth.material.uniforms.uDusk.value = 5;
    fx.bloom = 0.5; fx.bloomThreshold = 0.9; fx.bloomRadius = 0.35; fx.exposure = 1.15;
  } else if (mode === 'satellites') {
    SUN.set(1, 0.25, 0.55).normalize();
    orient(30, 15, new THREE.Vector3(0.1, 0.35, 1), 0);
    const d = lerp(10.0, 9.2, easeInOut(p));
    camera.position.set(0.0, 1.2, d); camera.lookAt(0, 0.0, 0);
    sun.position.copy(SUN).multiplyScalar(60);
    const tOff = 0.7; // ab hier: keine Schwerkraft -> Satelliten fliegen geradeaus
    for (const s of sats) {
      s.g.visible = s.orbit.visible = s.trail.visible = true;
      const posAt = (tt) => {
        const ta = Math.min(tt, tOff); const a = s.a0 + s.w * ta;
        const P = s.u.clone().multiplyScalar(Math.cos(a) * s.radius).add(s.v.clone().multiplyScalar(Math.sin(a) * s.radius));
        if (tt <= tOff) return P;
        const Vv = s.u.clone().multiplyScalar(-Math.sin(a) * s.radius * s.w).add(s.v.clone().multiplyScalar(Math.cos(a) * s.radius * s.w));
        return P.add(Vv.multiplyScalar((tt - tOff) * 1.6));  // überzeichnet, damit sichtbar
      };
      s.g.position.copy(posAt(lt)); s.g.lookAt(0, 0, 0);
      const arr = s.trail.geometry.attributes.position.array; const n = Math.max(2, Math.round(200 * Math.min(1, lt / 4)));
      for (let k = 0; k < n; k++) { const P = posAt(lt * k / (n - 1)); arr[3 * k] = P.x; arr[3 * k + 1] = P.y; arr[3 * k + 2] = P.z; }
      s.trail.geometry.attributes.position.needsUpdate = true; s.trail.geometry.setDrawRange(0, n);
      s.trail.material.opacity = smooth(tOff, tOff + 0.4, lt);
      s.orbit.material.opacity = 0.5;
    }
    fx.bloom = 0.7;
  } else if (mode === 'gps') {
    SUN.set(0.9, 0.45, 0.6).normalize();
    orient(51, 10, new THREE.Vector3(0.0, 0.25, 1), 0);
    const dir = new THREE.Vector3(0.0, 0.25, 1).normalize();
    const d = lerp(5.5, 2.35, easeInOut(smooth(0, 0.8, p)));
    camera.position.copy(dir.clone().multiplyScalar(d)).add(new THREE.Vector3(0, -0.12 * (d - 1), 0));
    camera.lookAt(dir.clone().multiplyScalar(1.0 + 0.03));
    sun.position.copy(SUN).multiplyScalar(60);
    gpsGroup.visible = true;
    const pos = new THREE.Vector3(...latLon(51, 10, 1.0)); const up = pos.clone().normalize();
    const { pin, beam, pulse, base } = gpsGroup.userData;
    const rise = easeOut(smooth(0.3, 0.9, p)) * 0.16;
    base.position.copy(up.clone().multiplyScalar(1.001));
    pin.position.copy(up.clone().multiplyScalar(1.002 + rise));
    beam.position.copy(up.clone().multiplyScalar(1.001)); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    beam.scale.set(1, Math.max(0.0001, rise), 1);
    pulse.position.copy(up.clone().multiplyScalar(1.002)); pulse.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const pp = (lt * 0.9) % 1; pulse.scale.setScalar(0.004 + pp * 0.03); pulse.material.opacity = (1 - pp) * 0.6;
    const cd = camera.position.length() - 1; pin.scale.setScalar(0.022 * cd + 0.004); base.scale.setScalar(0.014 * cd + 0.003);
    fx.bloom = 0.75;
  } else if (mode === 'return' || mode === 'cracks') {
    SUN.set(1, 0.2, -0.15).normalize();
    orient(45, 20, new THREE.Vector3(-0.15, 0.35, 1), 0);
    sun.position.copy(SUN).multiplyScalar(60);
    const tb = voiceEvent('s08_rueckkehr', 0, 0.45);   // Moment „zurück"
    const since = t - tb;
    let grow, crack, shake;
    if (mode === 'return') {
      grow = since > 0 ? easeOut(clamp(since / 5.0)) * 0.028 : 0;
      crack = smooth(dur - 1.6, dur, lt) * 0.12;
      fx.flash = since > 0 ? Math.exp(-since * 6.0) * 0.6 : 0;
      shake = since > 0 ? Math.exp(-since * 1.2) * 0.09 + 0.01 : 0;
      ring.material.opacity = since > 0 ? Math.exp(-since * 1.1) * 0.9 : 0;
      ring.scale.setScalar(1 + Math.max(0, since) * 0.55);
      ring.lookAt(camera.position);
      const d = lerp(8.4, 7.8, easeInOut(p)); camera.position.set(0.2, 0.6, d); camera.lookAt(0, 0.0, 0);
      ghost.material.opacity = since > 0 ? 0.28 * smooth(0, 0.6, since) : 0;
    } else {
      grow = 0.028 + easeOut(p) * 0.012;
      crack = lerp(0.12, 1.0, easeOut(smooth(0.0, 0.85, p)));
      shake = 0.03 + 0.03 * Math.sin(p * Math.PI);
      const d = lerp(7.0, 5.4, easeInOut(p)); camera.position.set(0.3, 0.5, d); camera.lookAt(0, 0.1, 0);
      ghost.material.opacity = 0.22;
      SUN.set(0.6, 0.25, -0.75).normalize();  // mehr Nachtseite -> Glühen sichtbar
      earth.material.uniforms.uNight.value = 1.2;
    }
    earth.material.uniforms.uCrack.value = crack; earth.material = crack > 0 ? crackMat : earthMat;
    earthGroup.scale.setScalar(1 + grow); atmo.scale.setScalar(1 + grow);
    camera.position.x += wobble(t, 1) * shake; camera.position.y += wobble(t, 4) * shake;
    fx.bloom = 0.7 + crack * 0.25; fx.bloomThreshold = 0.8;
  }
  sun.lookAt(camera.position);
  for (const [k, o] of Object.entries({ earth, clouds, atmo, stars, sun })) if (H.includes(k)) o.visible = false;
  camera.updateProjectionMatrix();
  return { scene, camera, fx };
}
