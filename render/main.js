import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeShader } from './lib/grade.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import * as globe from './scenes/globe.js';
import * as cup from './scenes/cup.js';
import * as city from './scenes/city.js';
import * as cross from './scenes/cross.js';
import * as ball from './scenes/ball.js';

const W = 1080, H = 1920, FPS = 60;
const OPT = Object.fromEntries(new URLSearchParams(location.search));
const MSAA = OPT.msaa !== undefined ? parseInt(OPT.msaa) : 0;
const MODULES = { globe, cup, city, cross, ball };
// Welche Szene/Variante jede Einstellung des Drehbuchs zeigt
const SHOTS = {
  s01a: ['globe', 'sunrise'], s02a: ['cup', 'still'],
  s03a: ['city', 'dream_people'], s03b: ['city', 'dream_coast'],
  s04a: ['cross', 'close'], s04b: ['cross', 'wide'],
  s05a: ['city', 'rise'], s06a: ['ball', 'throw'],
  s07a: ['globe', 'satellites'], s07b: ['globe', 'gps'],
  s08a: ['globe', 'return'], s09a: ['globe', 'cracks'], s09b: ['city', 'quake'],
  s10a: ['cup', 'ripple'],
};

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: MSAA });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.5, 0.5, 0.9);
const fxaa = new ShaderPass(FXAAShader); fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
const grade = new ShaderPass(GradeShader);
composer.addPass(renderPass); if (OPT.bloom !== '0') composer.addPass(bloom); composer.addPass(new OutputPass()); if (OPT.fxaa !== '0') composer.addPass(fxaa); composer.addPass(grade);

let timeline = null, flat = [];
const DEFAULT_FX = { bloom: 0.45, bloomRadius: 0.5, bloomThreshold: 0.9, exposure: 1.0, desat: 0, soft: 0, fade: 0,
  flash: 0, vig: 0.55, grain: 0.035, ca: 0.005, warm: 0 };

async function setup() {
  timeline = await (await fetch('./timeline.json')).json();
  for (const sc of timeline.scenes) for (const sh of sc.shots) flat.push({ ...sh, scene: sc.id });
  const loader = new THREE.TextureLoader();
  const ctx = { renderer, THREE, loader, W, H, timeline };
  for (const m of Object.values(MODULES)) await m.init(ctx);
  // Shader einmal vorkompilieren (vermeidet Ruckler beim ersten Frame jeder Szene)
  for (const sh of flat) renderAt(sh.start + 0.01);
  return true;
}

function renderAt(t) {
  let sh = flat.find(s => t >= s.start && t < s.end) || flat[flat.length - 1];
  const [mod, mode] = SHOTS[sh.id];
  const lt = t - sh.start, dur = sh.end - sh.start;
  const out = MODULES[mod].frame(mode, lt, dur, t, sh);
  const fx = { ...DEFAULT_FX, ...(out.fx || {}) };
  renderPass.scene = out.scene; renderPass.camera = out.camera;
  renderer.toneMappingExposure = fx.exposure;
  bloom.strength = fx.bloom; bloom.radius = fx.bloomRadius; bloom.threshold = fx.bloomThreshold;
  const u = grade.uniforms;
  u.uTime.value = t; u.uDesat.value = fx.desat; u.uSoft.value = fx.soft; u.uFade.value = fx.fade; u.uFlash.value = fx.flash;
  u.uVig.value = fx.vig; u.uGrain.value = fx.grain; u.uCA.value = fx.ca; u.uWarm.value = fx.warm;
  composer.render();
  return sh.id;
}

window.FPS = FPS;
window.renderAt = renderAt;
window.ready = setup();
