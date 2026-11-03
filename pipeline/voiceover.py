"""Schritt 1: Sprecherstimme (kostenlos, lokal) + Zeitplan für Bild, Untertitel und Sound.

Erzeugt:
  build/voice/voice.wav      – fertige Sprachspur, 48 kHz Mono, bearbeitet
  build/timeline.json        – Szenen-, Shot-, Satz- und Untertitelzeiten (Single Source für den Rest)
"""
import json, re, subprocess
from pathlib import Path
import numpy as np, yaml, scipy.io.wavfile as wavfile
import sherpa_onnx

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"; (BUILD / "voice").mkdir(parents=True, exist_ok=True)
VOICE = "thorsten-high"
MODEL = ROOT / "models" / f"vits-piper-de_DE-{VOICE}"
SR_OUT = 48000

# Aussprache: was gesprochen wird (Untertitel zeigen den Originaltext)
SPOKEN = {"GPS": "Ge-Pe-Es", "500": "fünfhundert", "300": "dreihundert"}

# Pausen (Sekunden) – Regie
PAUSE_SENTENCE = 0.34
PAUSE_SCENE = 0.30
EXTRA_BEFORE = {"s02_twist": 0.15, "s04_druck": 0.55, "s08_rueckkehr": 0.85, "s10_ende": 0.6}
LEAD_IN = 0.12
TAIL = 1.6


def spoken(text):
    for k, v in SPOKEN.items():
        text = re.sub(rf"\b{k}\b", v, text)
    return text.replace("–", ",")


def trim(x, sr, thr=0.012):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(0.015 * sr)); b = min(len(x), idx[-1] + int(0.04 * sr))
    return x[a:b]


def main():
    scenes = yaml.safe_load(open(ROOT / "config/scenes.yaml"))["scenes"]
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=str(MODEL / f"de_DE-{VOICE}.onnx"), tokens=str(MODEL / "tokens.txt"),
            data_dir=str(MODEL / "espeak-ng-data"),
            length_scale=1.07, noise_scale=0.62, noise_scale_w=0.75),
        num_threads=4))
    tts = sherpa_onnx.OfflineTts(cfg)

    pieces, t, sr = [], LEAD_IN, None
    timeline = {"scenes": [], "sentences": [], "subtitles": []}
    for si, sc in enumerate(scenes):
        if si > 0:
            t += PAUSE_SCENE + EXTRA_BEFORE.get(sc["id"], 0)
        sents = [s for s in re.split(r"(?<=[.!?])\s+", sc["vo"].strip()) if s]
        sc_sent, cpos = [], 0
        for k, s in enumerate(sents):
            a = tts.generate(spoken(s), sid=0, speed=1.0)
            sr = a.sample_rate
            x = trim(np.array(a.samples, dtype=np.float32), sr)
            if k > 0:
                t += PAUSE_SENTENCE
            start = t; t += len(x) / sr
            pieces.append((start, x))
            c0 = sc["vo"].index(s, cpos); cpos = c0 + len(s)
            rec = {"scene": sc["id"], "text": s, "start": round(start, 3), "end": round(t, 3), "c0": c0, "c1": cpos}
            sc_sent.append(rec); timeline["sentences"].append(rec)
        timeline["scenes"].append({"id": sc["id"], "voice_start": sc_sent[0]["start"], "voice_end": sc_sent[-1]["end"]})

        # Untertitel: Zeichenposition -> Zeit (linear innerhalb eines Satzes)
        def c2t(c):
            for r in sc_sent:
                if c <= r["c1"]:
                    c = max(c, r["c0"])
                    return r["start"] + (c - r["c0"]) / max(1, r["c1"] - r["c0"]) * (r["end"] - r["start"])
            return sc_sent[-1]["end"]
        subs = sc["subtitles"]; flat = [s.replace("\n", " ") for s in subs]
        total = sum(len(f) + 1 for f in flat); scale = len(sc["vo"]) / total; acc = 0
        for f, raw in zip(flat, subs):
            c0, c1 = acc * scale, (acc + len(f)) * scale; acc += len(f) + 1
            timeline["subtitles"].append({"scene": sc["id"], "text": raw, "start": c2t(c0), "end": c2t(c1)})

    total_len = t + TAIL
    # Untertitel lückenlos innerhalb einer Szene, letzter Block hält kurz nach
    subs = timeline["subtitles"]
    for i, s in enumerate(subs):
        nxt = subs[i + 1] if i + 1 < len(subs) else None
        if nxt and nxt["scene"] == s["scene"]:
            s["end"] = nxt["start"]
        else:
            s["end"] = min(s["end"] + 0.35, nxt["start"] - 0.05 if nxt else total_len)
        s["start"], s["end"] = round(s["start"], 3), round(s["end"], 3)

    # Szenengrenzen fürs Bild: Schnitt kurz vor dem ersten Wort der Szene
    sc_tl = timeline["scenes"]
    for i, s in enumerate(sc_tl):
        s["start"] = 0.0 if i == 0 else round(s["voice_start"] - 0.18, 3)
    for i, s in enumerate(sc_tl):
        s["end"] = sc_tl[i + 1]["start"] if i + 1 < len(sc_tl) else round(total_len, 3)
        shots = next(x for x in scenes if x["id"] == s["id"])["shots"]
        w = sum(sh["length"] for sh in shots); a = s["start"]
        s["shots"] = []
        for sh in shots:
            b = a + (s["end"] - s["start"]) * sh["length"] / w
            s["shots"].append({"id": sh["id"], "start": round(a, 3), "end": round(b, 3)}); a = b
    timeline["duration"] = round(total_len, 3)

    # Zusammensetzen
    n = int(total_len * sr) + 1; buf = np.zeros(n, np.float32)
    for start, x in pieces:
        i = int(start * sr); buf[i:i + len(x)] += x
    raw = BUILD / "voice/voice_raw.wav"
    wavfile.write(raw, sr, (np.clip(buf, -1, 1) * 32767).astype(np.int16))
    # Klang: tiefer/wärmer (−0,9 Halbtöne, Formanten erhalten), EQ, sanfte Kompression, 48 kHz
    af = ("aresample=48000:resampler=soxr,"
          "rubberband=pitch=0.95:formant=preserved:pitchq=quality,"
          "highpass=f=75,lowshelf=f=180:g=2.5,equalizer=f=3200:t=q:w=1.2:g=1.5,"
          "deesser=i=0.35,"
          "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", af, "-ar", str(SR_OUT), "-ac", "1",
                    str(BUILD / "voice/voice.wav")], check=True)
    json.dump(timeline, open(BUILD / "timeline.json", "w"), ensure_ascii=False, indent=1)
    print(f"Dauer {total_len:.2f} s, {len(timeline['sentences'])} Sätze, {len(subs)} Untertitel")
    for s in sc_tl:
        print(f"  {s['id']:16s} {s['start']:6.2f} – {s['end']:6.2f}  ({s['end']-s['start']:.2f} s)")


if __name__ == "__main__":
    main()
