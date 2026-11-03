# Umsetzung (Phase 3): komplett lokal und kostenlos

Es gibt keine API-Schlüssel und keine Bild-KI, deshalb ist das Video **vollständig auf diesem Rechner** entstanden. Alle Bilder sind echte 3D-Echtzeitgrafik (three.js), die Frame für Frame berechnet wird.

## Pipeline

| Schritt | Werkzeug | Ergebnis |
|---|---|---|
| 1. Stimme + Zeitplan | `pipeline/voiceover.py` – Piper-Stimme **„Thorsten" (high)** über sherpa-onnx, frei und offline. Nachbearbeitung: −0,9 Halbtöne (Formanten erhalten), EQ, De-Esser, Kompressor | `build/voice/voice.wav`, `build/timeline.json` |
| 2. Untertitel | `pipeline/subtitles.py` – genau **eine** ASS-Spur, Timing aus der Sprachaufnahme | `build/subtitles/final.ass` |
| 3. Bild | `render/` – three.js in Headless-Chromium (SwiftShader), deterministisch: jeder Frame ist eine Funktion der Zeit. **Echte 60 fps ohne Interpolation.** | `build/video_nosound.mp4` |
| 4. Musik + Sound | `pipeline/sound.py` – synthetisiert (numpy/scipy): Drone-Musik, Sub-Booms, Ticken, Grollen, Klirren; Ducking unter der Stimme; Loudnorm −14 LUFS / −1 dBTP | `build/audio/master.wav` |
| 5. Montage | `pipeline/assemble.py` – BT.601→BT.709, Untertitel einbrennen, H.264 High@4.2 CRF 17, AAC 192 kbit/s, `+faststart` | `output/schwerkraft_final.mp4` |
| 6. Prüfung | `pipeline/qc.py` – prüft alle Vorgaben automatisch | Konsolenbericht |

**Komplett neu bauen:**
```bash
python3 pipeline/voiceover.py && python3 pipeline/subtitles.py
N=2 render/render_all.sh          # ca. 1 h auf 4 CPU-Kernen
python3 pipeline/sound.py && python3 pipeline/assemble.py && python3 pipeline/qc.py
```

## Szenen (Module in `render/scenes/`)

| Einstellung | Modul | Inhalt |
|---|---|---|
| s01a | `globe.js` sunrise | Sonnenaufgang über Europa aus dem All (NASA Blue/Black Marble) |
| s02a / s10a | `cup.js` | Kaffeetasse: still / mit Erdbebenwellen (Loop) |
| s03a / s03b | `city.js` dream | **als Irrtum markiert** (weich, entsättigt): Menschen, Autos und Wasser heben ab, harter Schnitt ins Schwarz |
| s04a / s04b | `cross.js` | Halbierte Erde: Schichten, Druck nach innen, dann nach außen |
| s05a | `city.js` rise | Drohne steigt über der Altstadt auf, alles normal |
| s06a | `ball.js` | Ball fliegt im Raum geradeaus (cyan), der Boden kommt ihm entgegen, aus Sicht des Werfers der gewohnte Bogen (orange) |
| s07a / s07b | `globe.js` | Satelliten verlassen ihre Bahn tangential, GPS-Punkt über Deutschland steigt |
| s08a | `globe.js` return | Schwerkraft zurück: Lichtblitz, Druckwelle, Erde dehnt sich (Referenzgitter = alter Radius) |
| s09a / s09b | `globe.js` cracks, `city.js` quake | Glühende Risse in der Kruste; Stadt bebt, Häuser stürzen ein, Staub |

## Ehrliche Einordnung

- Der Look ist eine **hochwertige 3D-Doku-Visualisierung**, nicht fotorealistisches Filmmaterial. Echter Fotorealismus braucht eine Bild- bzw. Video-KI (z. B. Imagen/Veo mit `GEMINI_API_KEY`) oder eine GPU. Beides ist hier nicht vorhanden.
- Die Stimme ist die beste kostenlose deutsche Männerstimme, die offline verfügbar ist. Sie klingt deutlich natürlicher als klassische TTS, erreicht aber nicht das Niveau kommerzieller Dienste.
- Die Bewegungen sind physikalisch berechnet: Bahnen, Bodenbeschleunigung, Wellen. Der Satellitenabflug und die Ausdehnung der Erde sind sichtbar überzeichnet, im echten Maßstab wären sie unsichtbar klein.
