# LiveTrak L-20 Web Mixer (`livetrak-l20-web`)

Web-basierte Remote-Control- und Monitor-Mixing-Anwendung für das **Zoom LiveTrak L-20**.

Ziel des Projekts ist eine moderne, touch-optimierte Oberfläche für iPad und Smartphones (privater Gebrauch für 3 Bandmitglieder), die gravierende Schwächen der originalen iOS-App behebt (fehlendes Stereo-Linking, umständliche Monitor-Bedienung, starre Channel-Views).

---

## 🎯 Kern-Features

1. **Verbesserte Mixer- & Channel-View:**
   - Klare, moderne Kanalzüge mit audiocn (echte dB-Fader, Rotary Knobs, Pegel-Meters).
   - Schneller Wechsel zwischen Kanal-Übersicht und Detail-Kanalzug (EQ, Low Cut, Kompressor, Sends).
2. **Echtes Stereo-Linking:**
   - Beliebige benachbarte Kanäle (z. B. 1 & 2 für Keys/Synths) können verlinkt werden.
   - Fader, Mute und EQ bewegen sich synchron.
   - Panorama (Pan) bleibt separat einstellbar.
3. **Überarbeitete Monitoring-Section (Personal Monitor Mixes):**
   - Dedizierte, fokussierte Ansicht für Musiker-Smartphones.
   - Jeder Musiker sieht nur seinen eigenen Monitor-Mix (Aux 1 bis 6 / Ausgänge A bis F).
   - Schutz vor versehentlichem Verstellen des Master-FOH-Mixes.
4. **Interaktive EQ-Kurve:**
   - Visualisierung des 3-Band-EQs (High-Shelf 10 kHz, Peaking Mid 100 Hz – 8 kHz, Low-Shelf 100 Hz, Low Cut 75 Hz) als dynamische SVG-Kurve.
5. **Protocol Discovery:**
   - Logging und Entdecken ungenutzter / versteckter Parameter des L-20 über den BTA-1 BLE-Adapter.

---

## 🏗 Architektur

```text
[ Musiker A (Phone) ]     [ Musiker B (Phone) ]     [ iPad Mini (Host) ]
        │                         │                         │
     (WLAN)                    (WLAN)                 (Lokales UI)
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  ▼
                    [ Lokaler WebSocket-Server ]
                                  │
                       [ Zentraler Mixer-State ]
                                  │
                      [ IMixerTransport Interface ]
                                 / \
      [ MockMixerTransport ] ◄───   ───► [ BleMixerTransport ]
       (Dev / Offline Test)                (Zoom BTA-1 BLE)
                                                  │
                                                  ▼
                                         [ Zoom LiveTrak L-20 ]
```

### 1. Transport-Entkopplung (`IMixerTransport`)
Die UI spricht ausschließlich mit einem standardisierten Interface. Für die Entwicklung zu Hause wird `MockMixerTransport` verwendet (simuliert Fader, Knobs und zufällige Metering-Werte). Im Proberaum wird der `BleMixerTransport` aktiviert.

### 2. Multi-Device Setup (iPad als Host)
* Das **iPad Mini** hält die einzige aktive Bluetooth-LE-Verbindung zum Zoom BTA-1.
* Auf dem iPad läuft neben der UI ein schlanker WebSocket-Server (z. B. via Capacitor iOS-Shell).
* Die Smartphones der Bandmitglieder verbinden sich im Proberaum-WLAN per Browser auf die IP des iPads.

---

## 🛠 Tech-Stack

* **Framework:** React + Vite + TypeScript
* **Styling & Audio-UI:** Tailwind CSS + [audiocn](https://audiocn.dev) (Fader, Knobs, Level-Meters)
* **EQ-Kurve:** SVG / Canvas Biquad Frequency Response
* **State Management:** Zustand oder Nano Stores
* **Bluetooth / Transport:** Web Bluetooth API / CoreBluetooth via Capacitor
