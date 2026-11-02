# L-20 Bluetooth-Protokoll (Stand: Mitschnitt vom 2026-11-02)

Quelle: PacketLogger-Mitschnitt von Ron (iPad Air, App „L-20 Control“, L-20 Firmware 1.23 mit BTA-1),
Datei `/mnt/project-files/mitschnitte/2026-11-02-l20.pklg`, Zeitenliste daneben.
Dekodieren: `python3 tools/decode-pklg.py <datei.pklg>` (Meter ausgeblendet, `--all` zeigt sie).

✅ = im Mitschnitt eindeutig gesehen · ❓ = Vermutung, braucht weiteren Test

## Transport

- Das L-20 wirbt als **`L-20_<BT-Adresse>`** (z. B. `L-20_D3A03DA784FC`).
- Es ist **Standard-BLE-MIDI** ✅: Service `03B80E5A-EDE8-4B33-A751-6CE34EC4C700`,
  Characteristic `7772E5DB-3868-4112-A1A9-F2669D106BF3` (Write without response + Notify).
  Kein eigenes Zoom-GATT, keine Verschlüsselung über BLE-MIDI hinaus.
- Für den Pi heißt das: BlueZ mit MIDI-Unterstützung reicht, das L-20 erscheint dann als ALSA-MIDI-Gerät.
- Das L-20 **bestätigt jeden Befehl**, indem es dieselbe CC-Nachricht zurückschickt ✅.
  Änderungen am Gerät selbst (Fader, Mute-Taste) kommen ebenfalls als CC zurück ✅.

## Verbindungsaufbau (App → L-20)

| Nachricht | Bedeutung |
|---|---|
| `F0 7E 7F 0D 70 …` | MIDI-CI Discovery (Standard, kann man vermutlich weglassen ❓) |
| `F0 7E 00 06 01 F7` | Identity Request → Antwort `F0 7E 00 06 02 52 72 00 03 00 "1.23" F7` (Zoom, Firmware 1.23) ✅ |
| `F0 52 00 00 2B F7` | Kompletter Zustand anfordern → Antwort `F0 52 00 00 2A …` (656 Byte): 18 Kanalnamen à 9 Byte (`CH1` … `CH17_18`, `CH19_20`) + Parameterblock (484 Byte, noch nicht entschlüsselt ❓) |
| `F0 52 00 00 07 00 F7` | Szenenliste → `F0 52 00 00 06 00 …` (99 Einträge `SCENE_01` …) ✅ |
| `F0 52 00 00 07 01/02 F7` | weitere Listen (je 30 Einträge, vermutlich Recorder-Projekte/Dateien ❓) |
| `B5 57 00` | unbekannt ❓ |
| `F0 52 00 00 50 F7` | Meter-Stream starten ❓ (danach ca. 15 Meter-Nachrichten pro Sekunde) |
| `F0 52 00 00 51 F7` | beim Trennen gesendet: Meter-Stream stoppen ❓ |

## Steuerbefehle (Control Change)

Der **MIDI-Kanal ist der Mixer-Kanal**: `B0` = Kanal 1, `B1` = Kanal 2 usw.
Werte sind 7-Bit (0–127).

| Funktion | Nachricht | Werte | Status |
|---|---|---|---|
| Kanal-Fader | `Bn 3C vv` | 0 (−∞) … 120 (Max), **0 dB = 82** | ✅ (dB-Tabelle ❓) |
| Mute | `Bn 30 vv` | 1 = an, 0 = aus | ✅ |
| Solo | `Bn 32 vv` | 1 = an, 0 = aus | ✅ |
| Pan | `Bn 0C vv` | 0 = L, 50 = Mitte, 100 = R | ✅ |
| EQ High | `Bn 14 vv` | 0 … 60 (Mitte vermutlich 30 = 0 dB ❓) | ✅ |
| Low Cut (Poti) | `Bn 2E vv` | 0 = aus … 56 = 600 Hz ❓ | ✅ |
| Send FX 1 | `Bn 34 vv` | 0 … 60 | ✅ |
| Send FX 2 | `Bn 36 vv` | 0 … 60 | ✅ |
| Send Monitor-Mix A | `Bn 53 vv` | 0 … 118 (Fader-Skala wie oben ❓) | ✅ für A, B–F ❓ |
| Rec/Play-Select | `Bn 08 vv` | 0 = aus, 2 = Rec (rot), 1 = Play (orange) | ✅ (1 lehnt das Gerät ab, wenn keine Aufnahme da ist: es antwortet mit 0) |
| Master-Fader | `BA 54 vv` | 0 … 120, 0 dB = 82 | ✅ |
| FX-1-Return-Fader | `BC 50 vv` | 0 … 120 | ✅ |
| FX-1-Effekttyp | `B0 4E vv` | Typ-Nummer (gesehen: 1, 3) | ✅; das Gerät meldet danach Parameter auf `B4/B5/BC/BD 4E` ❓ |
| Recorder-Taste | `B9 57 03`, `BA 57 03` | Antwort `B8 57 00`, `B9 59 00` | ❓ (ohne SD-Karte getestet) |
| ? | RX `B2 31 01/00` (19:41:13 / 19:42:14) | | ❓ evtl. Ansichtswechsel Master |

Noch nicht gesehen: EQ Low, EQ Mid (Gain/Freq), Phase, Mid-Frequenz, Szenen laden/speichern,
FX 2 Return, Monitor-Mix B–F, Master-GEQ, Stereo-Link, Kanalnamen schreiben.

## Nicht über Bluetooth

- **Gain** und **Kompressor** von Kanal 1 am Gerät gedreht: **keine Nachricht** ✅. Beides ist analog
  und für die App unsichtbar. Die App hat auch keinen Gain-Regler (laut Ron).

## Meter (L-20 → App)

`F0 52 00 00 31 04 <51 Byte> F7`, etwa 15 pro Sekunde. Im Mitschnitt lag kein Audiosignal an, fast alle
Bytes waren 0. Die Zuordnung Byte → Kanal ist offen ❓ und braucht einen Mitschnitt mit Signal.

## Nächster Mitschnitt (Vorschlag)

1. Mit SD-Karte: Recorder (Record → Play, Stopp, Pause, Vor/Zurück), Select orange.
2. Audiosignal nur auf Kanal 1, dann nur auf Kanal 2 (für die Meter-Zuordnung).
3. Fader Kanal 1 auf −10, −20, −40 dB stellen (für die dB-Tabelle).
4. EQ Low/Mid, Mid-Frequenz, Monitor-Mix B und F, FX 2 Return, Master-GEQ ein Band, Szene laden.
