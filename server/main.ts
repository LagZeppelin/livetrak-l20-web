/**
 * The Pi hub: serves the built web app and keeps every browser in sync over a WebSocket (/ws).
 * Start: npm run build && npm start   (PORT, default 8080; DATA_DIR for the saved phone list, default ./data)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import type { Device } from '@/lib/devices'
import { MockMixerTransport } from '@/transport/MockMixerTransport'
import { Hub } from './hub'

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

// shortcut: the built-in demo mixer stands in for the L-20; the Bluetooth link from the Pi comes with the hardware
const l20 = new MockMixerTransport()
const hub = new Hub(l20, loadDevices(), (devices) => {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2))
})

const http = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
  // only files inside dist/; unknown paths get the app (it reads ?phone etc. itself)
  const file = path.includes('..') || extname(path) === '' ? 'index.html' : path.slice(1)
  try {
    let body: Buffer | string = await readFile(join(WEB_DIR, file))
    // tells the app it runs on the hub, so it talks to /ws instead of Bluetooth or the demo
    if (file === 'index.html')
      body = body.toString().replace('</head>', '<meta name="l20-hub" content="1"></head>')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
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

await l20.connect()
http.listen(PORT, () => console.log(`L-20 Hub läuft: http://localhost:${PORT}`))
