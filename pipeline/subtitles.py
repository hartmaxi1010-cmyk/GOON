"""Schritt 2: genau EINE Untertitelspur (ASS, wird eingebrannt). Timing aus build/timeline.json."""
import json, yaml
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; B = ROOT / "build"; (B / "subtitles").mkdir(parents=True, exist_ok=True)
P = yaml.safe_load(open(ROOT / "config/project.yaml"))["subtitles"]
tl = json.load(open(B / "timeline.json"))

def ts(t):
    cs = int(round(t * 100)); return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"

head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Doku,Inter SemiBold,{P['size_px']},&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,0,0,0,0,100,100,0.5,0,1,3.2,1.6,2,{P['margin_side_px']},{P['margin_side_px'] + 40},{P['margin_bottom_px']},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
lines = []
subs = tl["subtitles"]
for i, s in enumerate(subs):
    txt = s["text"].replace("\n", "\\N")
    nxt = subs[i + 1] if i + 1 < len(subs) else None
    fout = 0 if (nxt and nxt["start"] - s["end"] < 0.1) else 120
    for ln in s["text"].split("\n"):
        assert len(ln) <= P["max_chars_per_line"], ln
    lines.append(f"Dialogue: 0,{ts(s['start'])},{ts(s['end'])},Doku,,0,0,0,,{{\\fad(70,{fout})}}{txt}")
open(B / "subtitles/final.ass", "w").write(head + "\n".join(lines) + "\n")
# zusätzlich SRT (nur zur Kontrolle / optionaler Upload, NICHT als zweite Spur im Video)
def srt(t): ms = int(round(t * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
open(B / "subtitles/final.srt", "w").write("\n".join(f"{i+1}\n{srt(s['start'])} --> {srt(s['end'])}\n{s['text']}\n" for i, s in enumerate(tl["subtitles"])))
print(len(lines), "Untertitel geschrieben")
