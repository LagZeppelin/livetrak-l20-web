import { expect, test } from 'vitest'
import { isOwnHost, route } from './portal'

test('the Pi itself is reached by IP, .local name or localhost', () => {
  for (const h of [
    '10.42.0.1',
    '10.42.0.1:80',
    'l20.local',
    'probertus.local:8080',
    'localhost',
    '[::1]:80',
  ])
    expect(isOwnHost(h)).toBe(true)
  for (const h of ['captive.apple.com', 'connectivitycheck.gstatic.com', 'www.msftconnecttest.com'])
    expect(isOwnHost(h)).toBe(false)
})

test('phones see the start page until they tapped a tile, then their internet check passes', () => {
  expect(route('captive.apple.com', '/hotspot-detect.html', false)).toBe('start')
  expect(route('captive.apple.com', '/hotspot-detect.html', true)).toBe('apple-success')
  expect(route('connectivitycheck.gstatic.com', '/generate_204', false)).toBe('start')
  expect(route('connectivitycheck.gstatic.com', '/generate_204', true)).toBe('no-content')
  expect(route('l20.local', '/', false)).toBe('app')
  expect(route('10.42.0.1', '/start', true)).toBe('start')
})
