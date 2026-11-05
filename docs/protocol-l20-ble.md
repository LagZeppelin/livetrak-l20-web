# L-20 Bluetooth-Protokoll

Stand: drei Mitschnitte von Ron vom 2026-11-02 und 2026-11-04 (iPad, App „L-20 Control“, L-20 Firmware 1.23 mit BTA-1).
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

| Nachricht                    | Bedeutung                                                                |
| ---------------------------- | ------------------------------------------------------------------------ |
| `F0 7E 00 06 01 F7`          | Identity Request → `F0 7E 00 06 02 52 72 00 03 00 "1.23" F7` ✅          |
| `F0 52 00 00 2B F7`          | Zustand anfordern → `F0 52 00 00 2A …` (656 Byte, siehe unten) ✅        |
| `F0 52 00 00 07 00/01/02 F7` | Szenenliste (99 × `SCENE_xx`) und zwei weitere Listen ✅ (nicht genutzt) |
| `F0 52 00 00 50 F7`          | Meter-Stream starten ✅; `… 51 F7` beim Trennen                          |

## Zustand (`F0 52 00 00 2A`)

Nach 5 Byte Kopf und 4 Byte (`08 05 00 00`) folgen 18 Kanalnamen à 9 Byte (Kanal 1–16, 17/18, 19/20), dann ein
Block, der überwiegend aus Feldern mit **18 Byte (ein Byte pro Kanalzug)** besteht. Offsets ab Blockbeginn ✅
(Werte wie bei den CCs unten):

| Offset | Inhalt          |     | Offset     | Inhalt                 |
| ------ | --------------- | --- | ---------- | ---------------------- |
| 18     | Select          |     | 198        | Low Cut                |
| 36     | Mute            |     | 216        | Send FX 1              |
| 54     | Solo            |     | 234        | Send FX 2              |
| 72     | Phase           |     |            |                        |
| 90     | Pan             |     |            |                        |
| 126    | EQ High         |     | 252        | Fader                  |
| 144    | EQ Mid-Frequenz |     | 270 + 18·k | Send Mix A…F (k = 0…5) |
| 162    | EQ Mid-Gain     |     | 378 / 379  | Effekttyp FX 1 / FX 2  |
| 180    | EQ Low          |     | 380 … 387  | Effekt-Regler (s. u.)  |
|        |                 |     | 392 … 397  | Mix-A…F-Ausgang        |
|        |                 |     | 408        | Master-Fader           |
|        |                 |     | 409 / 410  | FX-1- / FX-2-Return    |
|        |                 |     | 416 … 430  | Master-GEQ, 15 Bänder  |

Effekt-Regler 380…387 als MSB/LSB-Paare (Wert = MSB·128 + LSB): FX 1 Regler 1, FX 2 Regler 1, FX 1 Regler 2,
FX 2 Regler 2 ✅. Die Einheit hängt vom Effekt ab (z. B. Delay 481 = 481 ms) und ist noch nicht umgesetzt ❓.
Offen ❓: 411…414, Master-Mute.

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

| Funktion              | Nachricht                                                                  |                                |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| Master-Fader          | `BA 54 vv`                                                                 | ✅                             |
| Master-Mute           | `B9 54 01`                                                                 | ✅ (aus = 00 ❓)               |
| FX-1- / FX-2-Return   | `BC 50 vv` / `BD 50 vv`                                                    | ✅                             |
| Mix-A…F-Ausgang       | `B0`…`B5 53 vv`                                                            | ✅ (Mix-Busse haben kein Mute) |
| FX-Return je Mix      | `Bx 51 vv`: A FX1 = `B0`, A FX2 = `B1`, B FX1 = `B4`                       | ✅; Schema der übrigen ❓      |
| Effekttyp FX 1 / FX 2 | `B0 4E vv` / `B1 4E vv`                                                    | Index in der Effektliste ✅    |
| Effekt-Regler         | MSB/LSB: FX1 R1 `B4/B5 4E`, FX2 R1 `B6/B7`, FX1 R2 `BC/BD`, FX2 R2 `BE/BF` | ✅ (nicht umgesetzt)           |
| Master-GEQ            | `Bb 55 vv`, Band b = MIDI-Kanal b                                          | 30 = 0 dB ✅                   |
| Ansicht in der App    | `B5 57 vv` (0 Main, 2…6 = Mix B…F)                                         | nur Anzeige, nicht nötig       |

Recorder ✅:

|                     |                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tasten (App → L-20) | `B9 57 03` Record, `BA 57 03` Play (auch Pause), `BB 57 03` Stop, `BD 57 05/04` vor, `BC 57 05/04` zurück (drücken/loslassen) |
| Status (L-20 → App) | `B8 57 vv`: 0 Stop, 1 Play, 3 Record bereit, 4 Pause, 5 Aufnahme                                                              |
| Zählwerk            | `B8`…`BB 58 vv`, `BB` = Sekunden, `BA` = Minuten, `B9` = Stunden ❓; `BC`…`BF 58` = Restzeit ❓                               |

## Meter (`F0 52 00 00 31 04 …`, ca. 15 pro Sekunde)

Byte 6+n = Kanal n (1–20) ✅. Werte sind 0 oder 16…31: Bit 4 = Signal, untere 4 Bit = Stufe 0…15. Die App verteilt die Stufen gleichmäßig auf −48…0 dBFS ❓ (mit Testton gegen die LEDs am Gerät kalibrieren).
Master- und FX-Meter sind noch nicht zugeordnet ❓.
