"""Schritt 3: Musik + Soundeffekte (lokal synthetisiert, lizenzfrei) und Mix mit der Stimme.

Alle Ereignisse werden aus build/timeline.json abgeleitet – dieselben Zeitpunkte wie im Bild.
Ausgabe: build/audio/{music,sfx,mix}.wav und build/audio/master.wav (−14 LUFS, −1 dBTP)
"""
import json, subprocess
from pathlib import Path
import numpy as np
import scipy.io.wavfile as wavfile
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = Path(__file__).resolve().parents[1]
B = ROOT / "build"; (B / "audio").mkdir(parents=True, exist_ok=True)
SR = 48000
TL = json.load(open(B / "timeline.json"))
DUR = TL["duration"]; N = int(DUR * SR) + SR
rng = np.random.default_rng(42)


def sc(i):            return TL["scenes"][i]
def sents(sid):       return [s for s in TL["sentences"] if s["scene"] == sid]
def shot(sid):        return next(sh for s in TL["scenes"] for sh in s["shots"] if sh["id"] == sid)
def t2i(t):           return int(max(0, t) * SR)
def bp(x, lo, hi, o=4):  return sosfilt(butter(o, [lo, hi], btype="band", fs=SR, output="sos"), x)
def lp(x, f, o=4):    return sosfilt(butter(o, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f, o=4):    return sosfilt(butter(o, f, btype="high", fs=SR, output="sos"), x)
def noise(n):         return rng.standard_normal(n)
def env_exp(n, tau):  return np.exp(-np.arange(n) / SR / tau)
def ramp(t, a, b):    return np.clip((t - a) / max(1e-6, b - a), 0, 1)
def smooth(t, a, b):  x = ramp(t, a, b); return x * x * (3 - 2 * x)
T = np.arange(N) / SR


def brown(n):
    x = np.cumsum(noise(n)); x = hp(x, 15, 2); return x / (np.max(np.abs(x)) + 1e-9)


def add(buf, sig, t, gain=1.0):
    i = t2i(t); j = min(len(buf), i + len(sig))
    if j > i: buf[i:j] += sig[: j - i] * gain


def stereo(m, width=0.0, delay_ms=0.0):
    if width == 0 and delay_ms == 0: return np.stack([m, m], 1)
    d = int(delay_ms * SR / 1000); r = np.concatenate([np.zeros(d), m[:len(m) - d]]) if d else m
    return np.stack([m, (1 - width) * m + width * r], 1)


def reverb_ir(sec=2.4, damp=4500):
    n = int(sec * SR); e = np.exp(-np.arange(n) / SR * (6.9 / sec))
    L = lp(noise(n), damp, 2) * e; R = lp(noise(n), damp, 2) * e
    L[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR)); R[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return np.stack([L, R], 1) / np.sqrt(np.sum(L ** 2))


IR = reverb_ir()
def verb(st, wet=0.3):
    out = np.zeros_like(st)
    for c in range(2): out[:, c] = fftconvolve(st[:, c], IR[:, c])[: len(st)]
    return st * (1 - wet) + out * wet


# ---------- Ereigniszeiten (identisch zur Bildlogik) ----------
s01 = sents("s01_hook"); t_impact = s01[0]["end"] - 0.25
s03 = sents("s03_irrtum"); t_cut = shot("s03b")["end"] - 0.36; t_s04 = sc(3)["start"]
s04 = sents("s04_druck"); t_push = s04[2]["start"] if len(s04) > 2 else sc(3)["end"] - 1.5
s06 = sents("s06_ball"); sh6 = shot("s06a"); t_throw = sh6["start"] + 0.45; t_land = s06[1]["start"] + 0.35
s07 = sents("s07_satelliten"); t_ping = shot("s07b")["start"] + 0.9; t_tick_end = s07[-1]["end"] + 0.15
s08 = sents("s08_rueckkehr"); t_boom = s08[0]["end"] - 0.45
s10 = shot("s10a"); t_end = DUR

# ---------- Musik ----------
def tone(freqs, amp_curve, harmonics=6, detune=0.0015, cutoff=900):
    out = np.zeros(N)
    for f in freqs:
        for d in (-detune, 0, detune):
            ph = rng.random() * 6.28
            for h in range(1, harmonics + 1):
                if f * h > cutoff: break
                out += np.sin(2 * np.pi * f * (1 + d) * h * T + ph * h) / h
    return out * amp_curve / (len(freqs) * 3)

D1, A1, D2, F2, A2, C3, D3, F3, A3, Bb2 = 36.71, 55.0, 73.42, 87.31, 110.0, 130.81, 146.83, 174.61, 220.0, 116.54
music = np.zeros((N, 2))
lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.07 * T)
# Grundton: ab dem Impact, schweigt im Schnitt nach S03, kehrt mit S04 zurück, löst sich am Ende auf
g_base = smooth(T, t_impact - 0.05, t_impact + 0.6) * (1 - smooth(T, t_cut - 0.02, t_cut)) + smooth(T, t_s04, t_s04 + 1.5)
g_base *= 1 - smooth(T, t_end - 2.5, t_end - 0.2) * 0.85
base = tone([D1, D2], g_base * lfo, harmonics=3, cutoff=300) * 1.6
# Traum-Fläche (S03): hell, schwebend, Dur
g_dream = smooth(T, sc(2)["start"] - 0.2, sc(2)["start"] + 1.0) * (1 - smooth(T, t_cut - 0.03, t_cut))
dream = tone([293.66 * 2, 369.99 * 2, 440 * 2, 659.25 * 2], g_dream * (0.7 + 0.3 * np.sin(2 * np.pi * 3.1 * T)), harmonics=2, cutoff=4000) * 0.5
# Dunkle Fläche (S04–S07) mit langsamem Puls (Herzschlag-artig, 64 bpm)
g_dark = smooth(T, t_s04 + 0.3, t_s04 + 3.0) * (1 - smooth(T, t_tick_end - 0.3, t_tick_end + 0.4) * 0.6)
pulse = (np.maximum(0, np.sin(2 * np.pi * (64 / 60) * T)) ** 6) * 0.6 + 0.4
dark = tone([D2, F2, A2], g_dark * pulse, harmonics=7, cutoff=700) * 1.0
# Höhepunkt (S08–S09): Bb-Dur über D (Spannung), crescendo, dann Abbruch in S10
g_cl = smooth(T, t_boom, t_boom + 4.0) * (1 - smooth(T, s10["start"] + 0.3, s10["start"] + 2.5))
climax = tone([Bb2 / 2, D2, F2, Bb2, D3], g_cl * (0.8 + 0.2 * np.sin(2 * np.pi * 0.25 * T)), harmonics=8, cutoff=1100) * 1.5
# Schluss: einzelner tiefer Ton
g_out = smooth(T, s10["start"] + 1.5, s10["start"] + 3.0) * (1 - smooth(T, t_end - 1.0, t_end))
outro = tone([D2], g_out, harmonics=2, cutoff=300) * 1.2
m = base + dark + climax + outro
music += stereo(m, 0.6, 9) + verb(stereo(dream, 0.8, 14), 0.6)
music = verb(music, 0.25)

# ---------- Effekte ----------
sfx = np.zeros((N, 2))

def sub_boom(dur, f0, f1, tau):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / (tau * 0.4)); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env_exp(n, tau); s[: 240] *= np.linspace(0, 1, 240)
    s += lp(noise(n), 300) * env_exp(n, 0.08) * 0.6
    return s

def whoosh(dur, f_lo, f_hi, rise=True):
    n = int(dur * SR); x = noise(n); out = np.zeros(n); seg = 2400
    for k in range(0, n, seg):
        p = k / n if rise else 1 - k / n; fc = f_lo * (f_hi / f_lo) ** p
        out[k:k + seg] = bp(x[k:k + seg + 2000], fc * 0.7, fc * 1.4, 2)[: len(out[k:k + seg])]
    e = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return out * e

def tick(hi=True):
    n = int(0.06 * SR); c = bp(noise(n), 2500, 7000, 2) * env_exp(n, 0.004)
    c += np.sin(2 * np.pi * (1900 if hi else 1500) * np.arange(n) / SR) * env_exp(n, 0.012) * 0.5
    return c

def clink(f0):
    n = int(0.35 * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for k, (r, a, d) in enumerate([(1.0, 1, 0.09), (1.63, 0.6, 0.06), (2.37, 0.4, 0.04), (3.1, 0.25, 0.03)]):
        s += np.sin(2 * np.pi * f0 * r * t + k) * a * np.exp(-t / d)
    s[:48] *= np.linspace(0, 1, 48); return s

# Weltraum-Atmosphäre (S01, S07, S08) und Raumton (S02, S10)
space = lp(brown(N), 160) * 0.5
g_space = (1 - smooth(T, sc(1)["start"] - 0.1, sc(1)["start"])) + smooth(T, sc(6)["start"] - 0.1, sc(6)["start"]) * (1 - smooth(T, sc(8)["start"] + 2.5, sc(8)["start"] + 3.0))
sfx += stereo(space * g_space * 0.35, 0.7, 11)
room = lp(noise(N), 2500) * 0.02 + bp(noise(N), 250, 900) * 0.025 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * T))
g_room = ramp(T, sc(1)["start"], sc(1)["start"] + 0.05) * (1 - ramp(T, sc(2)["start"], sc(2)["start"] + 0.05)) + ramp(T, s10["start"], s10["start"] + 0.05)
sfx += stereo(room * g_room, 0.8, 7)
# Sonnenaufgang: aufsteigendes Rauschen bis zum Impact, dann Sub-Boom
add(sfx[:, 0], whoosh(t_impact, 80, 1200) * 0.12, 0); add(sfx[:, 1], whoosh(t_impact, 80, 1200) * 0.12, 0)
boom1 = sub_boom(3.0, 90, 34, 1.1)
for c in range(2): add(sfx[:, c], boom1 * 0.9, t_impact)
# Uhr-Ticken: jede Sekunde vom Impact bis zum Ende von S07 (im Traum verwaschen, im Schnitt stumm)
tt, k = t_impact + 0.6, 0
while tt < t_tick_end:
    in_dream = sc(2)["start"] <= tt < t_cut; muted = t_cut <= tt < t_s04
    if not muted:
        g = 0.09 if not in_dream else 0.05
        sig = tick(k % 2 == 0)
        add(sfx[:, 0], sig * g, tt); add(sfx[:, 1], sig * g, tt + 0.0004)
    tt += 1.0; k += 1
# Traum: luftiges Whoosh
dw = whoosh(sc(2)["end"] - sc(2)["start"], 300, 3000)
dwst = verb(stereo(np.concatenate([dw, np.zeros(SR)]) * 0.18, 0.9, 13), 0.6)
add(sfx[:, 0], dwst[:, 0], sc(2)["start"]); add(sfx[:, 1], dwst[:, 1], sc(2)["start"])
# S04: Druck – tiefes Grollen + Knarzen, auf „nach oben" ein Puls
g04 = smooth(T, t_s04, t_s04 + 1.5) * (1 - smooth(T, sc(3)["end"] - 0.3, sc(3)["end"]))
groan = lp(brown(N), 90) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.4 * T)) * g04 * 0.9
sfx += stereo(groan, 0.5, 15)
tc = t_s04 + 0.5
while tc < sc(3)["end"] - 0.4:
    n = int(0.12 * SR); cr = bp(noise(n), 280 + rng.random() * 500, 1400, 2) * env_exp(n, 0.03) * (0.06 + 0.1 * rng.random())
    pan = rng.random(); add(sfx[:, 0], cr * (1 - pan), tc); add(sfx[:, 1], cr * pan, tc)
    tc += 0.25 + rng.random() * 0.6
for c in range(2): add(sfx[:, c], sub_boom(2.2, 70, 38, 0.8) * 0.55, t_push); add(sfx[:, c], whoosh(1.4, 100, 900) * 0.1, t_push - 0.2)
# S05: Wind und ferner Verkehr
g05 = smooth(T, sc(4)["start"], sc(4)["start"] + 0.3) * (1 - smooth(T, sc(4)["end"] - 0.2, sc(4)["end"]))
wind = bp(noise(N), 180, 1100, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.23 * T + 1)) * 0.06 + lp(noise(N), 260) * 0.08
sfx += stereo(wind * g05, 0.9, 17)
# S06: Wurf und Landung
for c in range(2):
    add(sfx[:, c], whoosh(0.35, 600, 3500) * 0.12, t_throw - 0.1)
    add(sfx[:, c], sub_boom(0.6, 140, 70, 0.12) * 0.5, t_land)
    add(sfx[:, c], lp(noise(int(0.25 * SR)), 1500) * env_exp(int(0.25 * SR), 0.05) * 0.12, t_land)
g06 = smooth(T, sc(5)["start"], sc(5)["start"] + 0.2) * (1 - smooth(T, sc(5)["end"] - 0.2, sc(5)["end"]))
sfx += stereo(bp(noise(N), 300, 2500, 2) * 0.012 * g06, 0.9, 9)
# S07: Funk-Zirpen, GPS-Ping
for tb in np.arange(sc(6)["start"] + 0.4, t_ping - 0.2, 0.55):
    n = int(0.05 * SR); f = 1100 + rng.random() * 900
    bl = np.sin(2 * np.pi * f * np.arange(n) / SR) * np.hanning(n) * 0.025
    pan = rng.random(); add(sfx[:, 0], bl * (1 - pan), tb + rng.random() * 0.2); add(sfx[:, 1], bl * pan, tb + rng.random() * 0.2)
pg = np.concatenate([clink(1568)[: int(0.18 * SR)], clink(2093)])
pst = verb(stereo(np.concatenate([pg, np.zeros(SR)]) * 0.12, 0.5, 5), 0.4)
add(sfx[:, 0], pst[:, 0], t_ping); add(sfx[:, 1], pst[:, 1], t_ping)
# S08: großer Boom (synchron zum Lichtblitz) + aufbauendes Grollen bis S09
big = sub_boom(5.0, 75, 24, 2.2) + lp(noise(int(5 * SR)), 900) * env_exp(int(5 * SR), 0.25) * 0.5
bst = verb(stereo(big * 1.0, 0.4, 10), 0.35)
add(sfx[:, 0], bst[:, 0], t_boom); add(sfx[:, 1], bst[:, 1], t_boom)
g_r = smooth(T, t_boom + 0.3, sc(8)["start"] + 1.0) * (1 - smooth(T, s10["start"] + 0.3, s10["start"] + 2.8))
rumble = lp(brown(N), 140) * (0.55 + 0.45 * lp(np.abs(noise(N)), 3, 2) * 8)
sfx += stereo(rumble * g_r * (0.45 + 0.55 * smooth(T, sc(8)["start"], sc(8)["start"] + 2.5)) * 1.3, 0.6, 19)
# S09: Gesteinsbruch, Geröll
tc = sc(8)["start"] + 0.15
while tc < s10["start"] - 0.3:
    n = int(0.4 * SR); cr = hp(noise(n), 900) * env_exp(n, 0.04) * 0.3 + sub_boom(0.4, 120, 50, 0.15) * 0.3
    pan = rng.random(); add(sfx[:, 0], cr * (1 - pan) * (0.5 + rng.random() * 0.5), tc); add(sfx[:, 1], cr * pan * (0.5 + rng.random() * 0.5), tc)
    tc += 0.18 + rng.random() * 0.5
deb = np.zeros(N)
for _ in range(900):
    tt = sc(8)["start"] + rng.random() * (s10["start"] + 1.5 - sc(8)["start"]); n = int(0.015 * SR)
    add(deb, bp(noise(n), 1500, 6000, 2) * env_exp(n, 0.003) * rng.random() * 0.05, tt)
sfx += stereo(deb, 1.0, 3)
# S10: Tasse klirrt, solange sie wackelt; zum Schluss ein einzelner Tick (Loop zum Anfang)
tc = s10["start"] + 0.45
while tc < s10["start"] + 3.0:
    a = 0.05 * (1 - smooth(tc, s10["start"] + 2.2, s10["start"] + 3.0)) * (0.4 + 0.6 * rng.random())
    cl = clink(2350 + rng.random() * 300) * a; add(sfx[:, 0], cl, tc); add(sfx[:, 1], cl * 0.9, tc + 0.0003)
    tc += 0.07 + rng.random() * 0.22
for c in range(2): add(sfx[:, c], tick(True) * 0.12, t_end - 0.55)

# Harter Schnitt nach S03: alles außer der Stimme schweigt kurz
gate = 1 - (ramp(T, t_cut - 0.01, t_cut) * (1 - ramp(T, t_s04 - 0.05, t_s04 + 0.05)))
music *= gate[:, None]; sfx *= gate[:, None]

# ---------- Stimme + Mix ----------
sr_v, v = wavfile.read(B / "voice/voice.wav"); v = v.astype(np.float64) / 32768.0
voice = np.zeros(N); voice[: len(v)] = v[:N]
# Ducking: Musik/Effekte leiser, solange gesprochen wird
envv = lp(np.abs(voice), 8, 2); envv = envv / (np.max(envv) + 1e-9)
duck = 1 - 0.5 * np.clip(envv * 3, 0, 1)
def rms_db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
voice *= 10 ** ((-20 - rms_db(voice[voice != 0])) / 20)
music *= 10 ** ((-34 - rms_db(music)) / 20)
sfx *= 10 ** ((-28.5 - rms_db(sfx)) / 20)
mix = stereo(voice) + music * duck[:, None] + sfx * (0.55 + 0.45 * duck)[:, None]
mix = mix[: int(DUR * SR)]
# Ein- und Ausblenden gegen Knackser
f = int(0.01 * SR); mix[:f] *= np.linspace(0, 1, f)[:, None]; mix[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))[:, None]

def w(name, x): wavfile.write(B / "audio" / name, SR, np.clip(x, -1, 1).astype(np.float32))
w("music.wav", music[: int(DUR * SR)] * 0.5); w("sfx.wav", sfx[: int(DUR * SR)] * 0.5); w("mix.wav", mix / max(1.0, np.max(np.abs(mix)) * 1.05))

# Lautheit: zweistufiges loudnorm auf −14 LUFS / −1 dBTP
mixp = str(B / "audio/mix.wav")
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", mixp, "-af", "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"],
                   capture_output=True, text=True).stderr
js = json.loads(r[r.rindex("{"):r.rindex("}") + 1])
af = (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}"
      f":measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true,aresample=48000")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mixp, "-af", af, "-ar", "48000", "-c:a", "pcm_f32le", str(B / "audio/master.wav")], check=True)
print("Master geschrieben. Messung vorher:", js["input_i"], "LUFS")
