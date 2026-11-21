import { createBluetooth } from 'node-ble'
import { BLE_MIDI_CHARACTERISTIC, BLE_MIDI_SERVICE } from '@/lib/l20Midi'
import type { BleLink } from '@/transport/BleMidiTransport'

const SCAN_MS = 30_000

/**
 * The Pi's Bluetooth link to the L-20 via BlueZ: scans for a device named "L-20…" and opens its BLE-MIDI port.
 * If the link drops, `onLost` runs (main.ts then restarts the server);
 * without a D-Bus system bus node-ble throws an unhandled error, which also ends the server for systemd to restart.
 */
export async function openBlueZ(onLost: () => void): Promise<BleLink> {
  console.log('Bluetooth: suche L-20 …')
  const { bluetooth, destroy } = createBluetooth()
  const adapter = await bluetooth.defaultAdapter()
  if (!(await adapter.isDiscovering())) await adapter.startDiscovery()
  const until = Date.now() + SCAN_MS
  let device = null
  while (!device && Date.now() < until) {
    for (const addr of await adapter.devices()) {
      const d = await adapter.getDevice(addr)
      const name = await d.getName().catch(() => '')
      if (name.startsWith('L-20')) {
        device = d
        break
      }
    }
    if (!device) await new Promise((r) => setTimeout(r, 1000))
  }
  if (!device) {
    destroy()
    throw new Error('Kein L-20 gefunden. Ist der BTA-1 eingesteckt und der L-20 an?')
  }
  await adapter.stopDiscovery().catch(() => {})
  console.log(`Bluetooth: ${await device.toString()} gefunden, verbinde …`)
  // the L-20's MIDI port only takes writes from a paired device (else BlueZ answers NotAuthorized); pairing is "just works"
  if (String(await device.isPaired()) !== 'true') {
    console.log('Bluetooth: kopple mit dem L-20 (einmalig) …')
    await device.pair().catch((e: Error) => {
      throw new Error(`Koppeln mit dem L-20 fehlgeschlagen: ${e.message}`)
    })
  }
  await device.connect()
  device.on('disconnect', onLost)
  const service = await (await device.gatt()).getPrimaryService(BLE_MIDI_SERVICE)
  const char = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC)
  await char.startNotifications()
  console.log('Bluetooth: MIDI-Dienst geöffnet')
  return {
    // a refused write means the link is unusable; restarting connects (and pairs) afresh instead of crashing
    write: (packet) =>
      char.writeValueWithoutResponse(Buffer.from(packet)).catch((e: Error) => {
        console.error(`Bluetooth: Senden an den L-20 abgelehnt (${e.message})`)
        onLost()
      }),
    onData: (listener) => char.on('valuechanged', listener),
    close: () => {
      device.off?.('disconnect', onLost)
      void device.disconnect().finally(destroy)
    },
  }
}
