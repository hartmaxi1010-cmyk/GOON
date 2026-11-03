"""Schritt 4: Endmontage – Bild (60 fps) + eingebrannte Untertitel + Master-Audio -> MP4 (H.264/AAC)."""
import subprocess, yaml
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; B = ROOT / "build"; OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)
P = yaml.safe_load(open(ROOT / "config/project.yaml"))
v, a = P["video"], P["audio"]
out = OUT / "schwerkraft_final.mp4"
# Frames kommen als JPEG (BT.601, Vollbereich) -> sauber nach BT.709/TV-Bereich wandeln, dann Untertitel einbrennen
vf = (f"scale={v['width']}:{v['height']}:flags=lanczos:in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,"
      f"ass={B / 'subtitles/final.ass'}:fontsdir=/usr/share/fonts/opentype/inter,format={v['pix_fmt']}")
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-stats", "-i", str(B / "video_nosound.mp4"), "-i", str(B / "audio/master.wav"),
       "-map", "0:v:0", "-map", "1:a:0", "-vf", vf,
       "-c:v", v["codec"], "-profile:v", v["profile"], "-level:v", v["level"], "-preset", v["preset"], "-crf", str(v["crf"]),
       "-g", str(v["gop"]), "-keyint_min", str(v["gop"]), "-sc_threshold", "0", "-r", str(v["fps"]), "-fps_mode", "cfr",
       "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
       "-c:a", a["codec"], "-b:a", a["bitrate"], "-ar", str(a["sample_rate"]), "-ac", str(a["channels"]),
       "-movflags", "+faststart", "-shortest", "-metadata", "title=Zehn Sekunden ohne Schwerkraft", str(out)]
subprocess.run(cmd, check=True)
print("geschrieben:", out)
