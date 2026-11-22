#!/usr/bin/env bash
# Sets up a Raspberry Pi 5 (Raspberry Pi OS 64-bit, Bookworm or Trixie) as the L-20 hub. Safe to run again.
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

echo "=== 1/5 Programme installieren (Node.js 20.19+ oder 22.12+, git) ==="
# the app builds on Node 20.19+ as well as 22.12+ (only the test runner wants 22, and tests don't run on the Pi)
node_ok() {
  node -e 'const [a, b] = process.versions.node.split(".").map(Number)
    process.exit(a > 22 || (a === 22 && b >= 12) || (a === 20 && b >= 19) ? 0 : 1)' 2>/dev/null
}
sudo apt-get update -q
# Raspberry Pi OS Trixie brings Node 20.19 itself; older systems get Node 22 from NodeSource
CANDIDATE="$(apt-cache policy nodejs | awk '/Candidate:/ {print $2}')"
if ! node_ok && dpkg --compare-versions "${CANDIDATE:-0}" ge 20.19; then
  sudo apt-get install -y nodejs npm
fi
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node_ok || { echo "Node.js ist zu alt ($(node -v 2>/dev/null)). Bitte Screenshot an Claude schicken."; exit 1; }
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

# BlueZ's own MIDI plugin grabs the L-20's MIDI service and then refuses our writes (NotAuthorized); the hub talks MIDI itself
BTD="$(systemctl show -p ExecStart bluetooth | grep -o 'path=[^ ;]*' | head -1 | cut -d= -f2)"
sudo mkdir -p /etc/systemd/system/bluetooth.service.d
printf '[Service]\nExecStart=\nExecStart=%s -P midi\n' "${BTD:-/usr/libexec/bluetooth/bluetoothd}" |
  sudo tee /etc/systemd/system/bluetooth.service.d/no-midi.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart bluetooth

echo "=== 4/5 Autostart ==="
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
ExecStart=$(command -v node) dist-server/main.js
Restart=always
# not faster: every restart reconnects Bluetooth, which disturbs the Pi's WLAN
RestartSec=20

[Install]
WantedBy=multi-user.target
UNIT
# no automatic updates (Ron, 2026-11-22): the Pi stays offline; update by hand with pi/update.sh over a LAN cable
sudo systemctl disable --now l20-update.timer 2>/dev/null || true
sudo rm -f /etc/systemd/system/l20-update.service /etc/systemd/system/l20-update.timer
# update.sh restarts the hub after an update
echo "$ME ALL=(root) NOPASSWD: /usr/bin/systemctl restart l20-hub" | sudo tee /etc/sudoers.d/l20-hub >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now l20-hub

echo "=== 5/5 Eigenes WLAN \"L20\" (ab dem nächsten Neustart) ==="
sudo nmcli connection delete L20 >/dev/null 2>&1 || true
sudo nmcli connection add type wifi ifname wlan0 con-name L20 ssid L20 autoconnect yes \
  connection.autoconnect-priority 100 802-11-wireless.mode ap 802-11-wireless.band bg \
  ipv4.method shared ipv4.addresses 10.42.0.1/24 wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASS" >/dev/null
# captive portal: on this WLAN every name points to the Pi, so phones open the start page by themselves
sudo mkdir -p /etc/NetworkManager/dnsmasq-shared.d
echo "address=/#/10.42.0.1" | sudo tee /etc/NetworkManager/dnsmasq-shared.d/l20-portal.conf >/dev/null

echo
echo "Fertig. Nach einem Neustart (sudo reboot) öffnet der Pi das WLAN \"L20\"."
echo "iPad und Handys: mit \"L20\" verbinden, die Startseite öffnet sich von selbst (sonst http://10.42.0.1)."
echo "Updates: LAN-Kabel zum Router, dann bash ~/livetrak-l20-web/pi/update.sh"
