# Projektplan – „Was wäre, wenn die Schwerkraft 10 Sekunden aussetzt?"

Status: **Phase 1 abgeschlossen. Warte auf Freigabe für Phase 2.**

## 1. Bestandsaufnahme

**Repository:** leer, kein Commit, Remote `hartmaxi1010-cmyk/GOON`. Es gibt keinen vorhandenen Code, den man berücksichtigen müsste.

**Rechner:** 4 CPU-Kerne, 15 GB RAM, ca. 31 GB freier Speicher, **keine GPU**.

| Werkzeug | Status | Verwendung |
|---|---|---|
| FFmpeg 6.1.1 | ✅ mit libx264, aac, libass, minterpolate, xfade, sidechaincompress, loudnorm | Schnitt, 60-fps-Interpolation, Untertitel, Mix, Encoding |
| Python 3.13 + numpy, pillow, requests | ✅ | Pipeline-Skripte, Audio-Synthese |
| ImageMagick 6.9 | ✅ | Bild-Checks, Kontaktabzüge |
| Node 22 | ✅ | nicht benötigt |
| Schrift Inter | ✅ systemweit | Untertitel |
| PyPI / npm | ✅ erreichbar | Pakete installierbar |
| Blender, SoX, Piper, eSpeak | ❌ | nicht nötig |
| GPU / CUDA | ❌ | lokale KI-Bild- oder Videomodelle sind **nicht praktikabel** |

**Netzwerk (Richtlinie der Cloud-Umgebung):**

| Dienst | Host | Status |
|---|---|---|
| Google Gemini API (Imagen, Veo, Gemini-TTS) | generativelanguage.googleapis.com | ✅ erreichbar |
| ElevenLabs | api.elevenlabs.io | ❌ blockiert (403) |
| fal.ai, Replicate, OpenAI | – | ❌ blockiert |
| Hugging Face (Modell-Downloads) | huggingface.co | ❌ blockiert |
| Pixabay, Freesound (Stock-Audio) | – | ❌ blockiert |

## 2. Technische Entscheidungen

| Baustein | Entscheidung | Begründung |
|---|---|---|
| Keyframes (Standbilder) | **Google Imagen 4** über die Gemini API, 9:16 | fotorealistisch, Host erreichbar, gleicher Schlüssel wie für Video |
| Bewegung | **Google Veo (3.x)**, Bild-zu-Video aus dem Keyframe, 9:16, Clips mit max. 8 s | glaubwürdige Physik und Bewegung, Konsistenz durch Keyframe |
| 60 fps | Veo liefert 24 fps → **FFmpeg `minterpolate`** (bewegungskompensiert) auf 60 fps | einzige lokal machbare Lösung ohne GPU. Ausweichlösung: 60 fps per Bildverdopplung (ohne Artefakte, aber nicht flüssiger) |
| 1080×1920 | Erzeugung in der höchsten 9:16-Stufe, die Veo anbietet. Falls nur 720p: Lanczos-Skalierung mit leichtem Nachschärfen | wird in Phase 2 per Testaufruf geprüft |
| Sprecherstimme | **Empfehlung: ElevenLabs** (Multilingual, deutsche Männerstimme aus der Voice Library). **Alternative: Gemini-TTS** (kein weiterer Dienst nötig) | in Phase 2: Hörprobe beider Stimmen zum Vergleich |
| Untertitel | eine **eingebrannte ASS-Spur** (libass), automatisch getaktet aus den Sprachaufnahmen, Inter SemiBold, 2 Zeilen, innerhalb der TikTok-Safe-Zone | genau eine Spur. Hinweis: TikTok-Auto-Untertitel beim Upload **deaktivieren**, sonst erscheinen sie doppelt |
| Soundeffekte | ① Veo-Originalton der Clips (Umgebung, Wasser, Rumpeln) als SFX-Spur, ② lokal synthetisierte Effekte (Sub-Swell, Rumble, Whoosh, Stille-Moment) mit numpy | keine Lizenzprobleme. Stock-Bibliotheken sind blockiert, eigene Dateien kannst du in `assets/sfx/` ablegen |
| Musik | lokal komponierte, dezente **Ambient-Drone** (numpy/FFmpeg). Alternativ dein eigener lizenzierter Track in `assets/music/` | lizenzfrei. Ducking unter der Stimme per Sidechain |
| Mix / Mastering | Stimme −16 LUFS, Musik gedämpft, Ende `loudnorm` auf **−14 LUFS / −1 dBTP** | Plattform-Standard |
| Encoding | H.264 High@4.2, yuv420p, CRF 17, 60 fps CFR, GOP 120, BT.709, AAC 48 kHz 192 kbit/s, `+faststart` | entspricht deinen Vorgaben |

## 3. Szenenplan (≈ 58 s)

| # | Zeit | Bild | Sprechertext (Kurzform) | Sound |
|---|---|---|---|---|
| 1 | 0:00–0:05 | Kaffeetasse, Flüssigkeit hebt als schwebende Kugeln ab | „Zehn Sekunden. Mehr braucht es nicht." | Café-Raumton, Sub-Swell |
| 2 | 0:05–0:11 | Drohnenflug über europäische Stadt bei Sonnenaufgang | Die Frage | ferne Stadt, Wind |
| 3 | 0:11–0:17 | Fußgängerzone, Füße lösen sich minimal | „Fast nichts. Niemand wird ins All geschleudert." | Straße, Umgebung wird dumpf |
| 4 | 0:17–0:27 | Park: Brunnenwasser in Bögen, Laub und Menschen ≈ 1 m hoch | Erdrotation, alles fliegt geradeaus weiter | Drone steigt |
| 5 | 0:27–0:33 | Autos gleiten ohne Haftung, Bremslichter | „Bremsen sind wirkungslos." | Reifen, ferne Hupe |
| 6 | 0:33–0:40 | Nordseeküste, Meer hebt sich, Gischt steigt | Ozeane dehnen sich aus | Wellen, Tiefenrumpeln |
| 7 | 0:40–0:47 | Alpental, Risse im Asphalt, Steine schweben | Druck im Erdinneren, Beben | Erdbeben-Rumble |
| 8 | 0:47–0:53 | Fußgängerzone: alles fällt gleichzeitig | „Alles fällt." | **½ s Stille**, dann Aufprall |
| 9 | 0:53–0:58 | Kaffeetropfen fallen auf den Tisch (Loop zu Szene 1) | „…nicht mehr dieselbe." | Platschen, Musik löst auf |

Details mit Prompts: `config/scenes.yaml`. Sprechertext und Faktencheck: `script/voiceover_de.md`.

**Spannungsbogen:** ruhiger Einstieg → Staunen (1–4) → Kontrollverlust (5) → Bedrohung (6–7) → Höhepunkt mit Stille und Aufprall (8) → nachdenklicher Schluss als Loop (9).

## 4. Pipeline – so wird alles zusammengeführt

```
config/scenes.yaml
   │
   ├─▶ 01_keyframes.py    Imagen: 3–4 Varianten je Szene → Kontaktabzug → Auswahl (mit dir)
   ├─▶ 02_video_clips.py  Veo Bild-zu-Video je Keyframe → build/clips_raw (24 fps + Originalton)
   ├─▶ 03_voiceover.py    TTS je Szene → build/voice/*.wav (48 kHz) + gemessene Dauer
   ├─▶ 04_subtitles.py    Sätze in Untertitel-Blöcke teilen, Timing aus der Audiodauer → build/subtitles/final.ass
   ├─▶ 05_sound.py        Musik-Drone + synthetische SFX + Veo-Ton → Stems
   └─▶ 06_assemble.py     FFmpeg: Zuschnitt 1080×1920 → Grading/Grain → minterpolate 60 fps
                          → xfade-Übergänge → Untertitel einbrennen → Mix mit Ducking
                          → loudnorm → H.264/AAC → output/schwerkraft_final.mp4
        └─▶ 07_qc.py      ffprobe-Prüfung: Auflösung, fps, Codecs, Dauer, Lautheit
```

Die Szenenlänge richtet sich nach der Sprachaufnahme: Szene = Sprachdauer + Atempause. Bei Bedarf werden Clips gekürzt oder verlangsamt.

## 5. Externe Dienste – was wirklich benötigt wird

> ⚠️ **Ohne mindestens einen KI-Bild/Video-Dienst ist fotorealistisches Material hier nicht machbar** (keine GPU, Stock-Quellen blockiert). Ohne Schlüssel kann ich nur die Pipeline mit Platzhaltern bauen und testen.

| Dienst | Nötig? | Zugang | Kosten (Stand meines Wissens, bitte aktuell prüfen) |
|---|---|---|---|
| **Google Gemini API** (Imagen + Veo) | **Pflicht** | API-Schlüssel aus Google AI Studio, **Abrechnung aktiviert** (Veo gibt es nur im bezahlten Tarif) | Imagen ca. 0,04 $/Bild. Veo „Fast" ca. 0,15 $/s, Veo Standard ca. 0,40 $/s. **Schätzung gesamt: ca. 25–65 $** (9 Clips, ca. 2 Versuche je Szene) |
| **ElevenLabs** | optional, empfohlen | API-Schlüssel. Kommerzielle Nutzung erst ab einem bezahlten Abo (ab ca. 5 $/Monat). **Zusätzlich** muss `api.elevenlabs.io` in der Netzwerk-Freigabe ergänzt werden | ab ca. 5 $ |
| Gemini-TTS | Alternative zu ElevenLabs | gleicher Gemini-Schlüssel | wenige Cent |
| Musik/SFX-Dienste | nicht nötig | – | 0 $ (lokal erzeugt) |

**So hinterlegst du die Zugangsdaten (bitte nicht in den Chat kopieren):**
Im Titelbereich der Session das Umgebungsmenü öffnen → *Edit* → dort unter *Network secrets* bzw. als Umgebungsvariable
`GEMINI_API_KEY` (und optional `ELEVENLABS_API_KEY`) eintragen. Für ElevenLabs zusätzlich unter *Network access → Allowed domains* den Eintrag `api.elevenlabs.io` hinzufügen und „Allow package managers" angehakt lassen. Doku: https://code.claude.com/docs/en/cloud-environments#network-access.
Eine **neue Session** übernimmt die Änderungen.

## 6. Ehrliche Grenzen

- **60 fps** sind interpoliert, weil die Quelle 24 fps hat. Bei chaotischen Schwebeszenen kann `minterpolate` Artefakte erzeugen. Das wird in Phase 2 an einem Clip getestet, und notfalls wechsle ich je Szene auf Bildverdopplung.
- **Konsistenz** von Figuren und Orten über mehrere Szenen (3 ↔ 8, 1 ↔ 9) ist mit KI-Video nur annähernd erreichbar. Gegenmaßnahme: dieselben Keyframes bzw. Varianten davon als Startbild verwenden.
- **Veo-Richtlinien:** Die Darstellung von Personen kann regional oder richtlinienbedingt eingeschränkt sein. Geplant sind ausschließlich Erwachsene, keine erkennbaren realen Personen.
- Die **Physik** ist ein Gedankenexperiment. Der Text ist vorsichtig formuliert (siehe Faktencheck).
- **KI-Kennzeichnung:** TikTok verlangt für realistisch wirkende KI-Inhalte das Label „KI-generiert". Bitte beim Upload aktivieren.

## 7. Phase 2 (nach Freigabe)

1. Abhängigkeiten installieren, Pipeline-Skripte schreiben.
2. Mit Platzhaltern einen technischen Probelauf ohne API-Kosten machen: Untertitel, Mix, 60-fps-Encoding, QC.
3. Mit Schlüssel: einen Test-Keyframe und einen Test-Clip erzeugen (Auflösung, Qualität, Interpolation prüfen) sowie Stimmproben.
4. Erst danach alle Szenen generieren, mit dir auswählen und den Endschnitt rendern.
