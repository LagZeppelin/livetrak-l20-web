/**
 * The Pi hub: serves the built web app and keeps every browser in sync over a WebSocket (/ws).
 * Start: npm run build && npm start   (PORT, default 8080; DATA_DIR for the saved phone list, default ./data;
 * talks to the real L-20 over Bluetooth when BlueZ/D-Bus is there (the Pi), otherwise runs the demo mixer;
 * L20=ble or L20=demo forces one)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { hostname } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { format } from 'node:util'
import { WebSocketServer } from 'ws'
import type { Device } from '@/lib/devices'
import { BleMidiTransport } from '@/transport/BleMidiTransport'
import { MockMixerTransport } from '@/transport/MockMixerTransport'
import { openBlueZ } from './ble'
import { Hub } from './hub'
import { route } from './portal'

const PORT = Number(process.env.PORT ?? 8080)
const DATA_DIR = process.env.DATA_DIR ?? 'data'
const WEB_DIR = new URL('../dist/', import.meta.url).pathname
const DEVICES_FILE = join(DATA_DIR, 'devices.json')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

function loadDevices(): Device[] {
  try {
    return JSON.parse(readFileSync(DEVICES_FILE, 'utf8')) as Device[]
  } catch {
    return [] // first start, or the file is unreadable: phones simply pick their mix again
  }
}

// the real L-20 wherever BlueZ is reachable (the Pi, however it was started); L20=demo or L20=ble forces a mode
const BLE = process.env.L20
  ? process.env.L20 === 'ble'
  : existsSync('/run/dbus/system_bus_socket') || existsSync('/var/run/dbus/system_bus_socket')
// a lost Bluetooth link ends the server; systemd starts it again, and the browsers reconnect by themselves
const l20 = BLE
  ? new BleMidiTransport(() =>
      openBlueZ(() => {
        console.error('Verbindung zum L-20 verloren, starte neu.')
        hub.setLink({ state: 'error', error: 'Verbindung zum L-20 verloren' })
        setTimeout(() => process.exit(1), 300) // lets the iPad still get the last lines
      }),
    )
  : new MockMixerTransport()
const hub = new Hub(l20, loadDevices(), (devices) => {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2))
})

// every server log line also goes to the admin panel on the iPad (still to the journal as before)
for (const [name, error] of [
  ['log', false],
  ['warn', true],
  ['error', true],
] as const) {
  const original = console[name]
  console[name] = (...args: unknown[]) => {
    original(...args)
    hub.addLog(format(...args), error)
  }
}

/** Devices (by IP) that tapped a tile on the start page; their "internet check" passes from then on. */
// shortcut: kept until the hub restarts (the Pi is switched off after each rehearsal); add an expiry if it runs for days
const accepted = new Set<string>()

const http = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
  const ip = req.socket.remoteAddress ?? ''
  if (path === '/portal/ok') {
    accepted.add(ip)
    return res.writeHead(204).end()
  }
  const to = route(req.headers.host ?? '', path, accepted.has(ip))
  if (to === 'no-content') return res.writeHead(204).end()
  if (to === 'apple-success')
    return res
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>')
  // only files inside dist/; unknown paths get the app (it reads ?phone etc. itself)
  const file =
    to === 'start'
      ? 'start.html'
      : path.includes('..') || extname(path) === ''
        ? 'index.html'
        : path.slice(1)
  try {
    let body: Buffer | string = await readFile(join(WEB_DIR, file))
    // tells the app it runs on the hub, so it talks to /ws instead of Bluetooth or the demo
    if (file === 'index.html')
      body = body.toString().replace('</head>', '<meta name="l20-hub" content="1"></head>')
    // the start page links to the Pi by the address this device reached it on (the portal comes in under any name)
    if (file === 'start.html') {
      const addr = (req.socket.localAddress ?? '').replace(/^::ffff:/, '')
      const port = req.socket.localPort === 80 ? '' : `:${req.socket.localPort}`
      body = body
        .toString()
        .replace('__PI__', `http://${addr.includes(':') ? `[${addr}]` : addr}${port}`)
        .replace('__NAME__', `${hostname().toLowerCase()}.local${port}`)
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // the portal pages must never come from a cache, or the phone's check keeps its old answer
      ...(to === 'start' && { 'cache-control': 'no-store' }),
    })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

new WebSocketServer({ server: http, path: '/ws' }).on('connection', (ws) => {
  const client = {
    send: (msg: object) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)),
  }
  hub.join(client)
  ws.on('message', (data) => hub.receive(client, data.toString()))
  ws.on('close', () => hub.leave(client))
})

http.listen(PORT, () => console.log(`L-20 Hub läuft: http://localhost:${PORT}`))

// until the L-20 is found the browsers show the empty default desk; the admin panel shows the search.
// Retries slow down to once a minute: on the Pi, WLAN and Bluetooth share one radio, and fast retries starve the WLAN.
for (let wait = 5; ; wait = Math.min(wait * 2, 60)) {
  try {
    hub.setLink({ state: 'searching' })
    await l20.connect()
    console.log(BLE ? 'Mit dem L-20 verbunden.' : 'Demo-Mixer läuft.')
    hub.setLink({ state: BLE ? 'connected' : 'demo' })
    break
  } catch (e) {
    console.error((e as Error).message, `Neuer Versuch in ${wait} s.`)
    hub.setLink({ state: 'error', error: (e as Error).message })
    await new Promise((r) => setTimeout(r, wait * 1000))
  }
}
