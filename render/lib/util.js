// Deterministische Hilfsfunktionen: alles ist eine Funktion der Zeit, keine Zufälligkeit zur Laufzeit.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// glatte 1D-Rauschfunktion für Kamerawackeln (Summe inkommensurabler Sinus)
export const wobble = (t, s = 0) => Math.sin(t * 13.1 + s) * 0.5 + Math.sin(t * 23.7 + s * 2.1) * 0.3 + Math.sin(t * 41.3 + s * 3.7) * 0.2;
export const latLon = (lat, lon, r = 1) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return [r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b)]; };
