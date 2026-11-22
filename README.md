# LiveTrak L-20 Web Mixer (`livetrak-l20-web`)

Web-basierte Fernbedienung und Monitor-Mixing für das **Zoom LiveTrak L-20**.

---

## 🎯 Funktionen

1. **Pult-Ansicht (iPad, FOH):** Kanalzüge mit dB-Fadern und Pegel-Metern, Ansicht Main / Master / Mix A–F, Kanal-Detail mit EQ-Kurve (3 Bänder + Low Cut), FX-Sends, Pan, Phase, Master-GEQ (15 Bänder), Recorder, Profile (speichern/laden).
2. **Stereo-Linking:** benachbarte Kanäle koppeln. Fader, Mute und EQ laufen synchron, Pan wird gespiegelt. 17/18 und 19/20 sind am L-20 feste Stereo-Kanäle.
3. **Handy-Ansicht (Musiker):** jeder Musiker wählt einen freien Mix A–F und sieht nur seinen eigenen In-Ear-Mix. Den Master kann er nicht verstellen, außer der Admin gibt ihm „Ganzes Pult“.
4. **Admin (iPad):** Reiter **Handys** (Mixe zuweisen, Rechte, entfernen) und **Verbindung** (Status iPad ⇄ Pi und Pi ⇄ L-20, Live-Log des Pi).
5. **Protokoll:** das Bluetooth-Protokoll des L-20 ist entschlüsselt (Standard BLE-MIDI), siehe [docs/protocol-l20-ble.md](docs/protocol-l20-ble.md).

---

## 🔌 Verbindungsschema

### Im Proberaum: Raspberry Pi 5 als Zentrale

```text
 ┌─────────────┐   Bluetooth (BLE-MIDI)   ┌──────────────────────────────┐
 │ Zoom L-20   │◀────────────────────────▶│ Raspberry Pi 5               │
 │ + BTA-1     │                          │ • hält die einzige BT-Verb.  │
 └─────────────┘                          │ • Node-Server (Dienst        │
                                          │   „l20-hub“, startet selbst) │
                                          │ • liefert die App aus        │
                                          │ • eigenes WLAN „L20“         │
                                          │   (10.42.0.1, mit Passwort)  │
                                          └──────────────┬───────────────┘
                                                         │ WLAN „L20“
                                                         │ App + WebSocket /ws
                          ┌──────────────────────────────┼──────────────────────────────┐
                          ▼                              ▼                              ▼
                 ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
                 │ iPad (Browser)  │           │ Handy (Browser) │           │ Handy (Browser) │  … bis zu 6 Mixe
                 │ Pult + Admin    │           │ Mix A           │           │ Mix B           │
                 └─────────────────┘           └─────────────────┘           └─────────────────┘
```

- **Kein Router, kein Internet:** der Pi macht sein eigenes WLAN „L20“ auf. Beim Verbinden öffnet sich die **Startseite** von selbst (Captive Portal), sonst `http://10.42.0.1`.
- **Der Pi hält den Zustand:** jede Änderung eines Browsers geht an den Pi, von dort an den L-20 und an alle anderen Browser. Bewegungen am L-20 selbst kommen ebenfalls bei allen an. Bricht das WLAN kurz ab, verbinden sich die Browser selbst neu.
- **Rechte prüft der Pi:** ein Handy ändert nur seinen eigenen Mix. Die Handy-Liste übersteht einen Neustart (`data/devices.json`).
- **Keine automatischen Updates:** der Pi bleibt offline. Aktualisieren von Hand mit LAN-Kabel zum Router: `bash ~/livetrak-l20-web/pi/update.sh`.
- Details: [docs/pi-zentrale.md](docs/pi-zentrale.md). Einrichten Schritt für Schritt: Projektdatei `anleitungen/pi-einrichten.md`.

### Ohne Pi: direkt per Bluetooth (ein Gerät, Test)

```text
 Zoom L-20 + BTA-1 ◀── Bluetooth (BLE-MIDI) ──▶ Browser mit Web Bluetooth, Adresse mit ?l20
                                                • Mac: Chrome (Safari kann kein Web Bluetooth)
                                                • iPad: App „Bluefy“
```

Die App liegt dafür auf GitHub Pages: <https://lagzeppelin.github.io/livetrak-l20-web/?l20> (verbinden per Tipp auf die Status-Anzeige). Hier gibt es keine Handys und keine Synchronisierung, nur dieses eine Gerät.

### Demo (ohne L-20)

Ohne `?l20` und ohne Pi läuft ein eingebauter Demo-Mixer mit Fake-Pegeln (`MockMixerTransport`), z. B. `npm run dev` oder die Demo-Datei.

---

## 🏗 Software-Aufbau

```text
src/
  ui/          React-Oberfläche (Pult, Kanal-Detail, Master, Handy, Admin, Profile)
  state/       Zustand-Stores, sprechen nur mit IMixerTransport
  transport/   IMixerTransport:
                 HubTransport       Browser ⇄ Pi (WebSocket)
                 BleMidiTransport   Bluetooth zum L-20 (Web Bluetooth im Browser, BlueZ auf dem Pi)
                 MockMixerTransport Demo-Mixer
  lib/         Datenmodell, L-20-MIDI-Kodierung, Skalen, Profile, Meter-Glättung
server/        Node-Server auf dem Pi: Zustand, WebSocket, Rechte, Bluetooth (BlueZ), Startseite
pi/            install.sh (Pi einrichten), update.sh (von Hand aktualisieren)
tools/         decode-pklg.py (Bluetooth-Mitschnitte auswerten)
docs/          Protokoll, Pi-Zentrale, Backlog
```

Welcher Transport läuft, entscheidet `src/state/connection.ts`: vom Pi ausgeliefert → Pi, `?l20` → Bluetooth direkt, sonst Demo.
Die Schichtregeln (UI → State → Transport) stehen in [CLAUDE.md](CLAUDE.md) und werden von `npm run audit` geprüft.

## 🛠 Tech-Stack

React 19 + Vite + TypeScript, Tailwind CSS v4, Zustand, eigene SVG-Bedienelemente (Fader, Meter, EQ-Kurve), Node-Server mit WebSocket und BlueZ (`node-ble`) auf dem Pi. Schriften: Geist / Geist Mono.

---

## 💻 Entwicklung

```bash
npm install
npm run dev     # Dev-Server mit Demo-Mixer, auch im LAN erreichbar (Handy-Test: ?phone)
npm run check   # Lint + Format + Architektur-Audit + Tests + Build (läuft auch in CI)
npm run build && npm start   # Pi-Server lokal: http://localhost:8080 (ohne BlueZ mit Demo-Mixer)
```

Backlog: [docs/backlog.md](docs/backlog.md)
