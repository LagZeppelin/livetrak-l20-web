import { expect, test } from 'vitest'
import { applyDeviceCommand, type Device, type DeviceCommand } from './devices'

const run = (...cmds: DeviceCommand[]) => cmds.reduce<Device[]>(applyDeviceCommand, [])

test('a phone joins waiting, renaming keeps its mix, blank names are ignored', () => {
  const d = run(
    { type: 'join', id: 'a', name: ' Lisa ' },
    { type: 'assign', id: 'a', mix: 'B' },
    { type: 'join', id: 'a', name: 'Lisa Bass' },
    { type: 'join', id: 'b', name: '  ' },
  )
  expect(d).toEqual([{ id: 'a', name: 'Lisa Bass', mix: 'B', foh: false }])
})

test('a mix belongs to one phone: assigning it again frees the old one', () => {
  const d = run(
    { type: 'join', id: 'a', name: 'Lisa' },
    { type: 'join', id: 'b', name: 'Tom' },
    { type: 'assign', id: 'a', mix: 'C' },
    { type: 'assign', id: 'b', mix: 'C' },
    { type: 'foh', id: 'b', allowed: true },
  )
  expect(d.map((x) => [x.name, x.mix, x.foh])).toEqual([
    ['Lisa', null, false],
    ['Tom', 'C', true],
  ])
  expect(applyDeviceCommand(d, { type: 'remove', id: 'b' }).map((x) => x.id)).toEqual(['a'])
})

test('a phone can only claim a free mix', () => {
  const d = run(
    { type: 'join', id: 'a', name: 'Lisa' },
    { type: 'join', id: 'b', name: 'Tom' },
    { type: 'claim', id: 'a', mix: 'A' },
    { type: 'claim', id: 'b', mix: 'A' },
    { type: 'claim', id: 'a', mix: 'B' },
  )
  expect(d.map((x) => x.mix)).toEqual(['B', null])
})
