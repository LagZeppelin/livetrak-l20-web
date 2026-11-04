import { expect, test } from 'vitest'
import { applyCommand, createMixer, type Mixer, type MixerCommand } from './mixer'
import { profileCommands } from './profile'

test('profile commands turn the current mixer into the saved one', () => {
  let target: Mixer = createMixer()
  for (const cmd of [
    { type: 'link', ch: 1, linked: true },
    { type: 'channel', ch: 3, patch: { fader: -12, mute: true, name: 'Vox' } },
    { type: 'eq', ch: 3, patch: { low: 4, lowCut: true } },
    { type: 'send', ch: 5, mix: 'C', patch: { level: -6 } },
    { type: 'bus', mix: 'fx2', patch: { effect: 3, params: [20, 70] as [number, number] } },
    { type: 'bus', mix: 'B', patch: { fader: -3 } },
    { type: 'geq', band: 7, gain: -4 },
  ] satisfies MixerCommand[])
    target = applyCommand(target, cmd)

  // current has a link the profile doesn't want (3+4), and a different scene/recorder
  let current = applyCommand(createMixer(), { type: 'link', ch: 3, linked: true })
  current = { ...current, scene: 2, recorder: { state: 'playing', position: 30 } }

  const cmds = profileCommands(current, target)
  const result = cmds.reduce(applyCommand, current)
  expect(result.channels).toEqual(target.channels)
  expect(result.main).toEqual(target.main)
  expect(result.monitors).toEqual(target.monitors)
  expect(result.fx).toEqual(target.fx)
  expect(result.recorder.state).toBe('playing')
  expect(profileCommands(result, target)).toEqual([])
})
