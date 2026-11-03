// Aufgeschnittene Erde: Schichten, Druck nach innen (Gewicht) -> Druck nach außen (S04).
import * as THREE from 'three';
import { NOISE } from '../lib/glsl.js';
import { clamp, lerp, smooth, easeInOut, easeOut, latLon } from '../lib/util.js';

let scene, camera, earthGroup, earthMat, faceMat, arrows, tl, stars;
const U = { uTime: { value: 0 }, uIn: { value: 0 }, uOut: { value: 0 } };

const VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){ vUv=uv; vObj=position; vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz;
gl_Position=projectionMatrix*viewMatrix*wp; }`;

// Oberfläche mit ausgeschnittenem Keil (x>0 && z>0)
const SURF_FS = `uniform sampler2D dayTex, waterTex; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){ if(vP.x>0.0) discard;
  vec3 N=normalize(vN); vec3 V=normalize(cameraPosition-vP); float ndl=dot(N,sunDir);
  vec3 c=texture2D(dayTex,vUv).rgb*(max(ndl,0.0)*0.95+0.05);
  float w=texture2D(waterTex,vUv).r; vec3 H=normalize(sunDir+V); c+=vec3(1.0,0.9,0.8)*pow(max(dot(N,H),0.0),60.0)*w*0.6;
  float f=pow(1.0-max(dot(N,V),0.0),3.0); c=mix(c,vec3(0.35,0.6,1.0)*max(ndl,0.0),f*0.5);
  gl_FragColor=vec4(c,1.0); }`;

// Schnittflächen: Schichtenaufbau (Kruste überzeichnet dick), Druckwellen
const FACE_FS = `uniform float uTime, uIn, uOut; varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vObj;
${NOISE}
void main(){
  float r=length(vObj); if(r>1.0) discard;
  vec3 q=vObj*3.0;
  float n=snoise(q*1.3+vec3(0.0,0.0,uTime*0.05))*0.6+snoise(q*2.9)*0.25;
  vec3 col;
  float crust=smoothstep(0.955,0.96,r);
  vec3 inner=vec3(1.0,0.88,0.62)*1.05;
  vec3 outer=mix(vec3(0.95,0.42,0.08)*0.7, vec3(1.0,0.62,0.2)*0.85, smoothstep(0.55,0.2,r));
  vec3 mantle=mix(vec3(0.55,0.12,0.03), vec3(0.22,0.05,0.02), smoothstep(0.55,0.95,r))*(0.85+0.35*n);
  vec3 crustC=mix(vec3(0.33,0.27,0.22), vec3(0.22,0.18,0.15), 0.5+0.5*sin(r*900.0+n*6.0))*(0.8+0.3*n);
  col = r<0.19 ? inner*(0.9+0.15*n) : (r<0.55 ? outer*(0.85+0.25*n) : mix(mantle, crustC, crust));
  // weiche Übergänge zwischen den Schichten
  col*=0.82+0.18*smoothstep(0.0,0.012,abs(r-0.19))*smoothstep(0.0,0.012,abs(r-0.55));
  // Druck: hell zur Mitte hin (Kompression)
  float press=pow(1.0-r,1.6);
  col+=vec3(1.0,0.55,0.2)*press*uIn*0.22;
  // Druckwellen: nach innen laufend (Gewicht), dann nach außen (Druck drückt zurück)
  float win=pow(0.5+0.5*sin(r*28.0+uTime*7.0),10.0)*uIn;
  float wout=pow(0.5+0.5*sin(r*22.0-uTime*9.0),8.0)*uOut;
  col+=vec3(1.0,0.7,0.4)*(win*0.18+wout*0.45)*(0.5+0.5*smoothstep(1.0,0.2,r));
  gl_FragColor=vec4(col,1.0);
}`;

export async function init(ctx) {
  tl = ctx.timeline;
  const L = (f, srgb = true) => new Promise(r => ctx.loader.load('./tex/' + f, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 1; r(t); }));
  const [day, water, sky] = await Promise.all([L('earth-blue-marble.jpg'), L('earth-water.png', false), L('night-sky.png')]);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0);
  camera = new THREE.PerspectiveCamera(32, ctx.W / ctx.H, 0.01, 200);
  stars = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, color: new THREE.Color(0.45, 0.45, 0.5) }));
  scene.add(stars);
  earthGroup = new THREE.Group(); scene.add(earthGroup);
  const sunDir = new THREE.Vector3(-0.3, 0.5, 1).normalize();
  earthMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: SURF_FS, uniforms: { dayTex: { value: day }, waterTex: { value: water }, sunDir: { value: sunDir } } });
  earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), earthMat));
  faceMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FACE_FS, uniforms: U, side: THREE.DoubleSide });
  const fa = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateY(Math.PI / 2), faceMat); // Schnittebene x=0 (Welt)
  scene.add(fa);
  earthGroup.rotation.y = -1.83;  // Europa liegt an der Schnittkante oben
  // Pfeile auf den Schnittflächen (radial)
  arrows = new THREE.Group(); scene.add(arrows);
  const shaft = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 10).translate(0, 0.035, 0);
  const head = new THREE.ConeGeometry(0.018, 0.04, 14).translate(0, 0.09, 0);
  const am = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.12, 1.1), transparent: true, opacity: 0 });
  for (const rr of [0.36, 0.64, 0.86]) { const n = rr < 0.5 ? 8 : 12; for (let k = 0; k < n; k++) {
    const ang = (k + (rr > 0.6 && rr < 0.7 ? 0.5 : 0)) / n * Math.PI * 2;
    const dir = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang));
    const g = new THREE.Group(); g.add(new THREE.Mesh(shaft, am), new THREE.Mesh(head, am));
    g.userData = { dir, rr }; arrows.add(g);
  } }
  arrows.userData.mat = am;
}

export function frame(mode, lt, dur, t, sh) {
  U.uTime.value = t;
  // Sätze der Szene: 0 = „zusammengedrückt…", 1 = „verschwindet nicht", 2 = „drückt weiter nach oben"
  const S = tl.sentences.filter(x => x.scene === 's04_druck');
  const tOut = S[2] ? S[2].start : sh.end - 1.5;
  const inAmt = smooth(S[0].start, S[0].start + 1.0, t) * (1 - smooth(tOut - 0.2, tOut + 0.3, t));
  const outAmt = smooth(tOut - 0.1, tOut + 0.5, t);
  U.uIn.value = inAmt; U.uOut.value = outAmt;
  // Pfeile: erst nach innen (Gewicht drückt), dann nach außen
  const am = arrows.userData.mat; am.opacity = Math.max(inAmt, outAmt) * 0.95;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
  for (const g of arrows.children) {
    const { dir, rr } = g.userData; const outward = outAmt > 0.5;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward ? dir : dir.clone().negate());
    g.quaternion.copy(q);
    const off = outward ? 0.03 * easeOut(outAmt) + 0.012 * pulse : -0.012 * pulse * inAmt;
    g.position.copy(dir.clone().multiplyScalar(rr + off + (outward ? -0.03 : 0.05))); g.position.x = 0.006;
    g.scale.setScalar(outward ? 1.0 + 0.25 * pulse : 0.9);
  }
  // Kamera: nah an der Schnittkante (Europa) -> zurückziehen, ganze aufgeschnittene Erde
  earthGroup.rotation.y = -1.83 + t * 0.004;
  const p = easeInOut(lt / dur);
  if (mode === 'close') {
    // dicht über der Kruste an der Schnittkante, langsam zurück
    camera.position.set(lerp(0.75, 1.5, p), lerp(1.15, 1.3, p), lerp(0.55, 0.95, p));
    camera.lookAt(new THREE.Vector3(0, 0.82, 0.25).lerp(new THREE.Vector3(0, 0.55, 0.1), p));
  } else {
    camera.position.set(lerp(1.5, 2.9, p), lerp(1.3, 1.45, p), lerp(0.95, 4.3, p));
    camera.lookAt(new THREE.Vector3(0, 0.55, 0.1).lerp(new THREE.Vector3(-0.25, 0.0, 0.0), p));
  }
  return { scene, camera, fx: { bloom: 0.55 + outAmt * 0.3, bloomThreshold: 0.95, bloomRadius: 0.55, exposure: 1.0, vig: 0.6 } };
}
