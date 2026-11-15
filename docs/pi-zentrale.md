# Raspberry Pi als Zentrale

```
L-20 ──Bluetooth (BLE-MIDI)── Raspberry Pi 5 ──WLAN── iPad (FOH), bis zu 3 Handys
                                  │
                                  └ Node-Server: liefert die App aus + WebSocket /ws
```

- **Der Pi hält den einzigen echten Zustand** (`server/hub.ts`): Mixer-Werte und die Handy-Liste.
  Jede Änderung eines Browsers geht an den Pi, von dort an den L-20 und an alle anderen Browser.
  Bewegungen direkt am L-20 gehen an alle Browser, der Stereo-Partner wird dabei auf dem Pi ergänzt.
- **Browser** erkennen am `<meta name="l20-hub">`, das der Pi in die Seite schreibt, dass sie über den Pi laufen
  (`src/transport/HubTransport.ts`). Bricht das WLAN kurz ab, verbinden sie sich selbst neu und bekommen den ganzen Stand.
- **Rechte werden auf dem Pi geprüft**: Ein Handy ändert nur seinen eigenen Mix (Sends, Mix-Fader, Mute, FX-Returns),
  außer der Admin hat ihm „Ganzes Pult“ gegeben. Handys dürfen sich nur selbst anmelden und einen freien Mix wählen.
- **Handy-Liste** wird in `data/devices.json` gespeichert und übersteht einen Neustart.

## Lokal ausprobieren (ohne Pi, mit Demo-Mixer)

```
npm run build
npm start            # http://localhost:8080 (iPad-Ansicht), http://localhost:8080/?phone (Handy)
```

`PORT` und `DATA_DIR` lassen sich per Umgebungsvariable ändern.

## Auf dem Pi

`pi/install.sh` richtet einen Raspberry Pi 5 ein (Node 22, App bauen, Bluetooth-Rechte, systemd-Dienst `l20-hub` auf Port 80
mit `L20=ble`, Update-Timer alle 15 min über `pi/update.sh`, eigenes WLAN „L20“ per NetworkManager ab dem nächsten Neustart).
Bluetooth läuft über BlueZ (`server/ble.ts`, Paket `node-ble`) mit derselben Logik wie im Browser (`BleMidiTransport` mit
austauschbarem `BleLink`). Reißt die Verbindung ab, beendet sich der Server und systemd startet ihn neu.
Schritt-für-Schritt-Anleitung für den Mac: Projektdateien `anleitungen/pi-einrichten.md`.

## Noch offen

1. Bluetooth vom Pi und WLAN „L20“ am echten Gerät testen.
2. Captive Portal → Startseite (Mixer / Licht), Status „L-20 verbunden“ im iPad.
3. Profile auf den Pi statt im Browser; Admin-PIN fürs iPad (heute gilt jeder Browser ohne `?phone` als Admin).
