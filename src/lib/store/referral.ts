/**
 * The referral code that brought this visitor (UPD), sent as `ref` with their
 * orders: UPD's developer pays referral credit on app orders and asked for the
 * code with the order (19 November 2026). UPD's website does the same with its
 * own links: `?ref=CODE`, 4–32 letters, digits or dashes, kept 30 days.
 *
 * A referral link that opens the app (https://app.usapeptidedepot.com/?ref=CODE)
 * is read once when the app loads, kept on this phone, and taken out of the
 * address bar.
 */
import { BRAND } from '@/brand'

const KEY = 'store-referral-v1'
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const CODE = /^[A-Za-z0-9-]{4,32}$/

/** The code in a `?ref=` parameter; undefined when absent or not a code. */
export function refFromSearch(search: string): string | undefined {
  const code = new URLSearchParams(search).get('ref')?.trim()
  return code && CODE.test(code) ? code.toUpperCase() : undefined
}

/** When the app loads: keeps a `?ref=` code (the newest wins) and tidies the address. UPD only. */
export function captureReferral(location: Location = window.location, now = Date.now()): void {
  if (BRAND.id !== 'upd' || !BRAND.features.store) return
  const code = refFromSearch(location.search)
  if (!code) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }))
  } catch {
    // Storage unavailable: the code is lost, as on the website.
  }
  const url = new URL(location.href)
  url.searchParams.delete('ref')
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

/** The kept code, for 30 days after the link was opened; undefined otherwise. */
export function currentReferral(now = Date.now()): string | undefined {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return undefined
    const { code, at } = raw as { code?: unknown; at?: unknown }
    if (typeof code !== 'string' || !CODE.test(code) || typeof at !== 'number' || now - at > KEEP_MS) return undefined
    return code
  } catch {
    return undefined
  }
}
