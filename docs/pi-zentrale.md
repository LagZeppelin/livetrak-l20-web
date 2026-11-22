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

`pi/install.sh` richtet einen Raspberry Pi 5 ein (Node 20.19+ aus Raspberry Pi OS oder Node 22 von NodeSource, App bauen, Bluetooth-Rechte, systemd-Dienst `l20-hub` auf Port 80
mit `L20=ble`, keine automatischen Updates (von Hand per LAN-Kabel: `bash pi/update.sh`), BlueZ-MIDI-Plugin aus, eigenes WLAN „L20“ per NetworkManager ab dem nächsten Neustart).
Bluetooth läuft über BlueZ (`server/ble.ts`, Paket `node-ble`) mit derselben Logik wie im Browser (`BleMidiTransport` mit
austauschbarem `BleLink`). Reißt die Verbindung ab, beendet sich der Server und systemd startet ihn neu.
Schritt-für-Schritt-Anleitung für den Mac: Projektdateien `anleitungen/pi-einrichten.md`.

## Startseite (Captive Portal)

Im WLAN „L20“ zeigt dnsmasq jeden Namen auf den Pi (`10.42.0.1`, `pi/install.sh`). Die Internet-Prüfung von iOS/Android
landet deshalb beim Pi, der mit der Startseite (`public/start.html`) antwortet. Handy und iPad öffnen sie von selbst.
Nach einem Tipp auf „Mixer“ merkt sich der Pi das Gerät (`/portal/ok`) und beantwortet die Prüfung wie erwartet
(`server/portal.ts`), damit es im WLAN bleibt. Auf dem iPhone weist die Seite auf Safari hin, weil das Pop-up-Fenster
nichts zum Home-Bildschirm legen kann. Ohne `?phone` wählt die App auf handygroßen Bildschirmen die Handy-Ansicht.

## Noch offen

1. Bluetooth vom Pi und WLAN „L20“ am echten Gerät testen.
2. Profile auf den Pi statt im Browser; Admin-PIN fürs iPad (heute gilt jeder Browser ohne `?phone` als Admin).
