# L-20 Bluetooth-Protokoll

Stand: vier Mitschnitte von Ron vom 2026-11-02, 2026-11-04 und 2026-11-14 (iPad, App „L-20 Control“, L-20 Firmware 1.23 mit BTA-1).
Dateien in `/mnt/project-files/mitschnitte/`, Zeitenlisten daneben. Umgesetzt in `src/lib/l20Midi.ts`, Test mit
dem echten Zustands-Dump in `src/lib/l20Midi.test.ts`.
Dekodieren: `python3 tools/decode-pklg.py <datei.pklg>` (Meter ausgeblendet, `--all` zeigt sie).

✅ = im Mitschnitt eindeutig gesehen · ❓ = Vermutung

## Transport

- Das L-20 wirbt als **`L-20_<BT-Adresse>`** und spricht **Standard-BLE-MIDI** ✅: Service
  `03B80E5A-EDE8-4B33-A751-6CE34EC4C700`, Characteristic `7772E5DB-3868-4112-A1A9-F2669D106BF3`.
- Das L-20 bestätigt jeden Befehl mit derselben CC-Nachricht ✅. Änderungen am Gerät (Fader, Mute, Select)
  kommen ebenfalls als CC ✅. Gain und Kompressor sind analog und kommen nicht ✅.

## Verbindungsaufbau

| Nachricht                    | Bedeutung                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `F0 7E 00 06 01 F7`          | Identity Request → `F0 7E 00 06 02 52 72 00 03 00 "1.23" F7` ✅                                                                          |
| `F0 52 00 00 2B F7`          | Zustand anfordern → `F0 52 00 00 2A …` (656 Byte, siehe unten) ✅                                                                        |
| `F0 52 00 00 07 00/01/02 F7` | Szenenliste (99 × `SCENE_xx`) und zwei weitere Listen ✅ (nicht genutzt)                                                                 |
| `F0 52 00 00 50 F7`          | Meter-Stream starten ✅; `… 51 F7` beim Trennen                                                                                          |
| `F0 52 00 00 00 00 F7`       | sendet die App, wenn das L-20 von sich aus einen neuen Zustand schickt; danach schickt sie die Mix-A…F-Ausgänge (`B0`…`B5 53`) erneut ❓ |

## Zustand (`F0 52 00 00 2A`)

Nach 5 Byte Kopf und 4 Byte (`08 05 00 00`) folgen 18 Kanalnamen à 9 Byte (Kanal 1–16, 17/18, 19/20), dann ein
Block, der überwiegend aus Feldern mit **18 Byte (ein Byte pro Kanalzug)** besteht. Offsets ab Blockbeginn ✅
(Werte wie bei den CCs unten):

| Offset | Inhalt          |     | Offset     | Inhalt                                     |
| ------ | --------------- | --- | ---------- | ------------------------------------------ |
| 18     | Select          |     | 198        | Low Cut                                    |
| 36     | Mute            |     | 216        | Send FX 1                                  |
| 54     | Solo            |     | 234        | Send FX 2                                  |
| 72     | Phase           |     |            |                                            |
| 90     | Pan             |     |            |                                            |
| 126    | EQ High         |     | 252        | Fader                                      |
| 144    | EQ Mid-Frequenz |     | 270 + 18·k | Send Mix A…F (k = 0…5)                     |
| 162    | EQ Mid-Gain     |     | 378 / 379  | Effekttyp FX 1 / FX 2                      |
| 180    | EQ Low          |     | 380 … 387  | Effekt-Regler (s. u.)                      |
|        |                 |     | 392 / 393  | FX-1- / FX-2-Return (Main)                 |
|        |                 |     | 394 … 405  | FX-Return je Mix: A FX1, A FX2, B FX1 … ❓ |
|        |                 |     | 408        | Master-Fader                               |
|        |                 |     | 409 … 414  | Mix-A…F-Ausgang                            |
|        |                 |     | 416 … 430  | Master-GEQ, 15 Bänder                      |

**Korrektur Mitschnitt 4:** Bis PR #16 standen Mix-Ausgänge auf 392 und FX-Returns auf 409/410. Belege für die neue
Lage ✅: Ron stellte vor Mitschnitt 4 beide FX-Returns auf 0 dB → 392/393 = 82/81; die App schickte nach einem
Zustand genau die Bytes 409…414 als `B0`…`B5 53` (Mix-Ausgänge); Mix A = 1 am Anfang von Mitschnitt 2 entspricht
dem letzten `B0 53 01` aus Mitschnitt 1. 394…405 waren in allen Mitschnitten 0, die Reihenfolge ist geraten ❓.

Effekt-Regler 380…387 als MSB/LSB-Paare (Wert = MSB·128 + LSB): FX 1 Regler 1, FX 2 Regler 1, FX 1 Regler 2,
FX 2 Regler 2 ✅. Einheiten siehe „Effekt-Regler“ unten. Master-Mute steht nicht im Zustand ❓.

## Steuerbefehle (Control Change)

Kanal 1–16 liegt auf MIDI-Kanal 0–15 (`B0`…`BF`) ✅. **Kanal 17/18 und 19/20 nutzen die nächste CC-Nummer
(n+1) auf MIDI-Kanal 0 bzw. 2** ✅ (z. B. Fader 17/18 = `B0 3D`, Mute 19/20 = `B2 31`).

| Funktion                       | CC                                      | Werte                                                                           |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| Select (Rec/Play)              | `08`                                    | 0 aus, 2 Rec (rot), 1 Play (orange; ohne Aufnahme antwortet das Gerät mit 0) ✅ |
| Pan                            | `0C`                                    | 0 L, 50 Mitte, 100 R ✅                                                         |
| EQ High / Mid-Gain / Low       | `14` / `1A` / `2C`                      | 0…60, 30 = 0 dB, 0,5-dB-Schritte ✅                                             |
| EQ Mid-Frequenz                | `18`                                    | 0…96 = 100 Hz…8 kHz, 53 = 1017 Hz ✅ (log dazwischen ❓)                        |
| Low Cut                        | `2E`                                    | 0 aus, 1…56 = 40…600 Hz, 24 = 101,4 Hz ✅ (log dazwischen ❓)                   |
| Phase                          | `0A`                                    | 1 an, 0 aus ✅                                                                  |
| Mute / Solo                    | `30` / `32`                             | 1 an, 0 aus ✅                                                                  |
| Send FX 1 / FX 2               | `34` / `36`                             | 0…60, **45 = 0 dB**, 60 = +10 dB ✅                                             |
| Fader                          | `3C`                                    | 0 = −∞, 8 = −40, 27 = −20, 45 = −10, **82 = 0**, 120 = +10 dB ✅                |
| Send Mix A / B / C / D / E / F | `3E` / `40` / `42` / `44` / `46` / `48` | wie Fader ✅                                                                    |

Busse:

| Funktion              | Nachricht                                                                                                          |                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Master-Fader          | `BA 54 vv`                                                                                                         | ✅                             |
| Master-Mute           | `B9 54 01` an, `B9 54 00` aus                                                                                      | ✅                             |
| FX-1- / FX-2-Return   | `BC 50 vv` / `BD 50 vv`                                                                                            | ✅                             |
| Mix-A…F-Ausgang       | `B0`…`B5 53 vv`                                                                                                    | ✅ (Mix-Busse haben kein Mute) |
| FX-Return je Mix      | A `B0/B1 51`, B `B4/B5 51`, C `B8/B9 51`, D `BC/BD 51`, E `B0/B1 52`, F `B4/B5 52` (je FX 1/FX 2), Werte wie Fader | ✅ (Mitschnitt 4)              |
| Effekttyp FX 1 / FX 2 | `B0 4E vv` / `B1 4E vv`                                                                                            | Index in der Effektliste ✅    |
| Effekt-Regler         | MSB/LSB: FX1 R1 `B4/B5 4E`, FX2 R1 `B6/B7`, FX1 R2 `BC/BD`, FX2 R2 `BE/BF`                                         | ✅ (Einheiten unten)           |
| Master-GEQ            | `Bb 55 vv`, Band b = MIDI-Kanal b                                                                                  | 30 = 0 dB ✅                   |
| Ansicht in der App    | `B5 57 vv` (0 Main, 2…6 = Mix B…F)                                                                                 | nur Anzeige, nicht nötig       |

Recorder ✅:

|                     |                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tasten (App → L-20) | `B9 57 03` Record, `BA 57 03` Play (auch Pause), `BB 57 03` Stop, `BD 57 05/04` vor, `BC 57 05/04` zurück (drücken/loslassen)                                            |
| Status (L-20 → App) | `B8 57 vv`: 0 Stop, 1 Play, 3 Record bereit, 4 Pause, 5 Aufnahme                                                                                                         |
| Zählwerke           | je vier Kanäle auf CC `58`: Stunden-MSB, Stunden-LSB (Stunden = MSB·128 + LSB), Minuten, Sekunden ✅                                                                     |
|                     | `B4`…`B7` = Länge der Aufnahme (nach Stopp, z. B. 0 0 2 16 = 2:16), `B8`…`BB` = Position, `BC`…`BF` = Restzeit auf der SD-Karte (2 43 23 14 = 299:23:14, wie am Display) |
| Unbekannt           | `BF 57 02` bei Aufnahmestart, `BF 57 01` etwas nach Stopp ❓                                                                                                             |

## Effekt-Regler (Mitschnitt 4, Werte aus der App abgelesen)

| Effekt   | Regler 1                                | Regler 2                                                              |
| -------- | --------------------------------------- | --------------------------------------------------------------------- |
| Hall 1   | Tone 0…100 = Rohwert ✅                 | Decay 0…100 = Rohwert ✅ (Mitte 49)                                   |
| Vocal 1  | Time 10…500 ms = Rohwert 9…499 (+1) ✅  | –                                                                     |
| Delay    | Time 10…1000 ms = Rohwert 9…999 (+1) ✅ | Feedback ❓ (nicht bewegt)                                            |
| Chorus 1 | –                                       | Rate 1…49 = Rohwert ✅ (Excel hat Rons Notiz in ein Datum verwandelt) |

Die App speichert die Rohwerte (`FxBus.params`), eine Anzeige der Regler gibt es noch nicht.

## EQ-Kurve (Mitschnitt 4)

Mid-Frequenz: 16 = 200 Hz, 37 = 497 Hz, 76 = 3065 Hz ✅ (dazu 0 = 100, 53 = 1017, 96 = 8000 Hz).
Low Cut: 11 = 60 Hz, 37 = 204,9 Hz, 49 = 403,9 Hz ✅ (dazu 1 = 40, 24 = 101,4, 56 = 600 Hz). Dazwischen logarithmisch.

## Meter (`F0 52 00 00 31 04 …`, ca. 15 pro Sekunde)

51 Datenbytes ab Byte 6. Byte 6 = Ansicht der App (wie `B5 57`) ✅. Byte 6+n = Kanal n (1–20) ✅, vor dem Fader
(bleibt bei Fader −∞). Kalibriert mit dem 1-kHz-Testton in 3-dB-Stufen (Gain so, dass 0 dBFS gerade clippt) ✅:

| Stufe (untere 4 Bit) | 10  | 9   | 8   | 7   | 6   | 5   | 4   | 3   | 2   | 1         | 0 (mit Bit 4) |
| -------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- | ------------- |
| dBFS                 | 0   | −3  | −6  | −9  | −12 | −15 | −18 | −21 | −24 | −27 … −42 | ≈ −45         |

Kanal-Bytes: Bit 4 = Signal, Bit 5 = Clip (0 dBFS kam als `2A`). Darunter (−48 dBFS) ist das Byte 0.

Bus-Meter (ohne Signal-/Clip-Bit, gleiche Stufen) ✅: Byte 31 folgt Kanal 1 Stufe für Stufe (Master links vor dem
Master-Fader ❓), Byte 55 liegt genau 3 Stufen tiefer – passt zum Master-Fader auf −10,5 dB (Rohwert 43) → Master
links nach dem Fader; die App zeigt Byte 55/56 als Master L/R. Der Testton lag hart links (Pan 0), daher ist R (56)
nur vermutet ❓. Beide Bytes bleiben dunkel, wenn der Kanal-Fader unten ist.
FX-Meter ❓: Beim zweiten Durchlauf (Kanal-Fader unten, FX-1-Send etwa −12 dB, FX-1-Return 0 dB) leuchtete kein
weiteres Byte.
