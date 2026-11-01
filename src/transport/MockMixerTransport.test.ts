import { expect, test } from 'vitest'
import { MockMixerTransport } from './MockMixerTransport'

test('echoes sent messages until unsubscribed', () => {
  const transport = new MockMixerTransport()
  const received: unknown[] = []
  const off = transport.onMessage((m) => received.push(m))

  transport.send({ type: 'ping' })
  off()
  transport.send({ type: 'ignored' })

  expect(received).toEqual([{ type: 'ping' }])
})
