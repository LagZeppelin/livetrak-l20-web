#!/usr/bin/env bash
# Sets up a Raspberry Pi 5 (Raspberry Pi OS 64-bit, Bookworm or newer) as the L-20 hub. Safe to run again.
# Usage (on the Pi, while it still has internet):
#   curl -fsSL https://raw.githubusercontent.com/LagZeppelin/livetrak-l20-web/main/pi/install.sh | bash -s -- 'WLAN-Passwort'
set -euo pipefail

PASS="${1:-}"
if [ "${#PASS}" -lt 8 ]; then
  echo "Bitte ein WLAN-Passwort mit mindestens 8 Zeichen angeben."
  exit 1
fi
APP="$HOME/livetrak-l20-web"
ME="$(id -un)"

echo "=== 1/5 Programme installieren (Node.js 22, git) ==="
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y git bluez

echo "=== 2/5 App holen und bauen ==="
[ -d "$APP/.git" ] || git clone https://github.com/LagZeppelin/livetrak-l20-web.git "$APP"
bash "$APP/pi/update.sh" --no-restart

echo "=== 3/5 Bluetooth-Rechte für die App ==="
sudo tee /etc/dbus-1/system.d/node-ble.conf >/dev/null <<CONF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="$ME">
    <allow own="org.bluez"/>
    <allow send_destination="org.bluez"/>
    <allow send_interface="org.bluez.GattCharacteristic1"/>
    <allow send_interface="org.bluez.GattDescriptor1"/>
    <allow send_interface="org.freedesktop.DBus.ObjectManager"/>
    <allow send_interface="org.freedesktop.DBus.Properties"/>
  </policy>
</busconfig>
CONF

echo "=== 4/5 Autostart und automatische Updates ==="
sudo tee /etc/systemd/system/l20-hub.service >/dev/null <<UNIT
[Unit]
Description=L-20 Mixer-Zentrale
After=network.target bluetooth.target

[Service]
User=$ME
WorkingDirectory=$APP
Environment=PORT=80 L20=ble
# port 80 so the iPad only needs http://l20.local
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/usr/bin/node dist-server/main.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo tee /etc/systemd/system/l20-update.service >/dev/null <<UNIT
[Unit]
Description=L-20 Mixer-Zentrale aktualisieren

[Service]
Type=oneshot
User=$ME
ExecStart=/bin/bash $APP/pi/update.sh
UNIT
sudo tee /etc/systemd/system/l20-update.timer >/dev/null <<UNIT
[Unit]
Description=L-20 Mixer-Zentrale alle 15 Minuten auf Updates prüfen

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
UNIT
# update.sh restarts the hub after an update
echo "$ME ALL=(root) NOPASSWD: /usr/bin/systemctl restart l20-hub" | sudo tee /etc/sudoers.d/l20-hub >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now l20-hub l20-update.timer

echo "=== 5/5 Eigenes WLAN \"L20\" (ab dem nächsten Neustart) ==="
sudo nmcli connection delete L20 >/dev/null 2>&1 || true
sudo nmcli connection add type wifi ifname wlan0 con-name L20 ssid L20 autoconnect yes \
  connection.autoconnect-priority 100 802-11-wireless.mode ap 802-11-wireless.band bg \
  ipv4.method shared wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASS" >/dev/null

echo
echo "Fertig. Nach einem Neustart (sudo reboot) öffnet der Pi das WLAN \"L20\"."
echo "iPad und Handys: mit \"L20\" verbinden, dann http://l20.local öffnen (Handys: http://l20.local/?phone)."
echo "Updates holt der Pi sich, sobald er per LAN-Kabel Internet hat."
