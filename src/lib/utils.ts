import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Random v4 UUID. crypto.randomUUID() exists only in secure contexts (https, localhost), but the Pi serves
 * plain http on the LAN, so fall back to getRandomValues(), which works everywhere.
 */
export function randomId(): string {
  if (globalThis.isSecureContext && crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Which view this device gets: the ?phone value ('' = no mix picked yet, 'C' = mix C for testing), '' on a
 * phone-sized screen without the parameter (e.g. typed in by hand), or null = iPad with the whole desk.
 */
export function phoneParam(): string | null {
  const phone = new URLSearchParams(globalThis.location?.search).get('phone')
  const small = !!globalThis.screen && Math.min(screen.width, screen.height) < 600
  return phone ?? (small ? '' : null)
}
