# Backlog

Stand: 2026-11-01. Reihenfolge = Vorschlag, wird nach Rons User-Flows angepasst.

## Phase 0 – Infrastruktur ✅

- Vite + React 19 + TS, Tailwind v4, Zustand, Prettier, oxlint, Vitest, CI
- Ordnerstruktur ui / state / transport, `IMixerTransport` + Mock-Stub

## Phase 1 – Grundlagen (nach den User-Flows)

1. User-Flows durchgehen → Screens & Rollen festlegen (FOH-iPad vs. Musiker-Phone)
2. ✅ Datenmodell (`src/lib/mixer.ts`): Kanäle 1–20, Main + 15-Band-GEQ, Mixe A–F, FX1/2, Sends mit Pre/Post, EQ + Low Cut, Rec-Select, Szenen 1–9, Recorder
3. ✅ Mock-Mixer mit eigenem Zustand, Szenen, Recorder-Uhr und Fake-Metering
4. ✅ Store-Logik inkl. Stereo-Link (Fader/Mute/Solo/EQ/Sends synchron, Pan gespiegelt) + Tests
5. audiocn-Komponenten einbinden (Fader, Knob, Meter)

## Phase 2 – UI

6. ✅ Kanal-Übersicht (iPad): Main-Mix mit FX-Returns und Master, Monitor-Mix A–F mit Pre/Post
7. ✅ Kanal-Detail mit EQ-Kurve (SVG), Low Cut, FX-Sends, Pan, Phase
8. ✅ Musiker-Ansicht (`?phone=C`): eigener Mix, Kanalauswahl, Stereo-Paare als eine Zeile
   8a. ✅ Master-GEQ (15 Bänder), Effekt-Auswahl FX1/2 (echte L-20-Effekte), Low Cut 40–600 Hz. Offen: Szenen benennen, Phones-Anzeige (kommt mit dem Pi)
   8b. Aus dem Handbuch der L-20 Control App (v2.0) und der L-20-Bedienungsanleitung, noch nicht umgesetzt (Rons Entscheidung nötig):
       - FX-Parameter 1/2 pro Effekt (Tone/Decay, Time/Feedback, Rate). Im Datenmodell vorhanden, noch ohne UI
       - Monitor-Mixe: Das L-20 kennt kein Pre/Post pro Send, jeder Mix A–F hat eigene Kanal- und FX-Return-Fader. Pro Ausgang wählbar: Master oder eigener Mix
       - Mix kopieren (Ausgang halten, Ziel antippen), EFX-Return-Mute, G-EQ an/aus, Szene löschen (Reset), Doppeltipp auf Fader = Reset
       - Recorder: Overdub, Rückspulen/Vorspulen, Projektname/-wechsel, Tempo. Kompressor und Gain nur am Gerät, nicht per App
       - Remote-Geräte sehen in der Original-App nur Pre-Fader-Meter

## Phase 3 – Echte Hardware

9. Protocol Discovery: BLE-MIDI-Traffic des BTA-1 mitschneiden und dokumentieren
10. `BleMixerTransport` im Node-Server auf dem Pi
11. Pi als Zentrale: Node-Server liefert Web-App + WebSocket aus, iPad und Phones als Clients (`WebSocketMixerTransport`)
12. Pi-Setup: Autostart, Updates automatisch aus GitHub

## Topologie (Entscheidung Ron, 2026-11-01)

- Zentrale = eigene Raspberry-Pi-Box am Reise-Router (nicht der Licht-Pi). Der Pi spricht Bluetooth (BTA-1) mit dem L-20 und betreibt den Node-Server.
- iPad und Phones sind reine Browser-Clients im WLAN, keine Capacitor-App. Damit bleiben die Clients OS-unabhängig.
- iPad ist Primary beim Master, Secondary in den Monitor-Mixen (Phones besitzen ihren Mix, iPad darf mitändern). Durchgesetzt wird das auf dem Pi.
- Code-Seite: alle Änderungen sind `MixerCommand`s (reines JSON) und laufen durch denselben Reducer `applyCommand`, im Browser wie auf dem Pi. Clients bekommen einen WebSocket-Transport, der Pi den BLE-Transport; der Stereo-Link wird beim Absender aufgelöst, der Pi leitet Befehle unverändert weiter.

## Offene Fragen / Risiken

- BLE vom Pi zum BTA-1 (z. B. Node + noble/BlueZ) noch nicht erprobt → früh einen Spike einplanen.
- L-20-Protokoll über BTA-1 ist nicht offiziell dokumentiert → Phase 3 hat das größte Unsicherheitsrisiko, früh einen Spike einplanen.
