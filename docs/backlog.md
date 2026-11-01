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

6. Kanal-Übersicht (iPad)
7. Kanal-Detail mit EQ-Kurve (SVG)
8. Musiker-Ansicht: eigener Aux-Mix, kein Zugriff auf FOH

## Phase 3 – Echte Hardware

9. Protocol Discovery: BLE-MIDI-Traffic des BTA-1 mitschneiden und dokumentieren
10. `BleMixerTransport` (Web Bluetooth bzw. Capacitor)
11. iPad als Host: WebSocket-Server, Phones als Clients

## Topologie (Entscheidung Ron, 2026-11-01)

- iPad = Hub: Bluetooth (BTA-1) zum L-20 und WLAN zum Router; Phones schicken ihre Befehle übers WLAN ans iPad, das sie an den Mixer weiterreicht.
- iPad ist Primary beim Master, Secondary in den Monitor-Mixen (Phones besitzen ihren Mix, iPad darf mitändern).
- Code-Seite: alle Änderungen sind `MixerCommand`s (reines JSON) und laufen durch denselben Reducer `applyCommand`. Phones bekommen später einen WebSocket-Transport, das iPad einen BLE-Transport; der Stereo-Link wird beim Absender aufgelöst, das iPad leitet Befehle unverändert weiter.

## Offene Fragen / Risiken

- Web Bluetooth gibt es in Safari/iOS nicht → iPad braucht vermutlich eine Capacitor-Shell (oder Bluefy-Browser zum Testen).
- Ein WebSocket-Server läuft nicht im Browser → ebenfalls Capacitor-Plugin oder kleiner Node-Server im LAN.
- L-20-Protokoll über BTA-1 ist nicht offiziell dokumentiert → Phase 3 hat das größte Unsicherheitsrisiko, früh einen Spike einplanen.
