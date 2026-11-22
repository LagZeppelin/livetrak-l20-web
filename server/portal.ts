/**
 * Captive portal: on the Pi's own WLAN every name resolves to the Pi (dnsmasq, see pi/install.sh), so a phone's
 * "is there internet?" check lands here. Until the user tapped a tile on the start page we answer with the start
 * page, which makes iOS/Android pop it up by itself; afterwards with the answer they expect, so they stay connected.
 */
export type Route = 'app' | 'start' | 'apple-success' | 'no-content'

/** Names that mean the Pi itself: an IP address, anything.local (mDNS, e.g. l20.local) or localhost. */
export function isOwnHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  return (
    /^[\d.]+$/.test(name) || name.includes(':') || name.endsWith('.local') || name === 'localhost'
  )
}

export function route(host: string, path: string, accepted: boolean): Route {
  if (!isOwnHost(host)) {
    if (!accepted) return 'start'
    // Android/Chrome check for 204 at …/generate_204; Apple (and most others) for a page saying "Success"
    return path.endsWith('generate_204') || path.endsWith('gen_204')
      ? 'no-content'
      : 'apple-success'
  }
  return path === '/start' ? 'start' : 'app'
}
