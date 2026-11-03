"""Schritt 5: Qualitätsprüfung der fertigen Datei gegen config/project.yaml."""
import json, subprocess, sys, yaml
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; f = ROOT / "output/schwerkraft_final.mp4"
P = yaml.safe_load(open(ROOT / "config/project.yaml"))
pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(f)], capture_output=True, text=True).stdout)
vs = [s for s in pr["streams"] if s["codec_type"] == "video"]; au = [s for s in pr["streams"] if s["codec_type"] == "audio"]
sub = [s for s in pr["streams"] if s["codec_type"] == "subtitle"]
v = vs[0]; a = au[0]; num, den = map(int, v["avg_frame_rate"].split("/"))
lo = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
I = float(lo.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0]); TP = float(lo.split("True peak:")[1].split("Peak:")[1].split("dBFS")[0])
checks = [
  ("Container MP4", pr["format"]["format_name"].startswith("mov,mp4"), pr["format"]["format_name"]),
  ("Auflösung 1080×1920", (v["width"], v["height"]) == (1080, 1920), f"{v['width']}×{v['height']}"),
  ("60 fps (konstant)", abs(num / den - 60) < 0.01 and v["r_frame_rate"] == "60/1", v["avg_frame_rate"]),
  ("Video H.264 High", v["codec_name"] == "h264" and v.get("profile") == "High", f"{v['codec_name']} {v.get('profile')} L{v.get('level')}"),
  ("yuv420p / BT.709", v["pix_fmt"] == "yuv420p" and v.get("color_space") == "bt709", f"{v['pix_fmt']} {v.get('color_space')}"),
  ("Audio AAC 48 kHz Stereo", a["codec_name"] == "aac" and a["sample_rate"] == "48000" and a["channels"] == 2, f"{a['codec_name']} {a['sample_rate']} {a['channels']}ch"),
  ("Dauer 50–60 s", 50 <= float(pr["format"]["duration"]) <= 60, f"{float(pr['format']['duration']):.2f} s"),
  ("keine zusätzliche Untertitelspur (eingebrannt)", len(sub) == 0, f"{len(sub)} Spuren"),
  ("Lautheit ≈ −14 LUFS", abs(I + 14) <= 1.0, f"{I} LUFS"),
  ("True Peak ≤ −1 dBTP (Toleranz 0,5)", TP <= -0.5, f"{TP} dBTP"),
]
ok = True
for n, c, val in checks:
    print(("✅" if c else "❌"), f"{n:45s} {val}"); ok &= c
print("Dateigröße:", round(int(pr["format"]["size"]) / 1e6, 1), "MB, Bitrate:", round(int(pr["format"]["bit_rate"]) / 1e6, 1), "Mbit/s")
sys.exit(0 if ok else 1)
