import { db } from './db'
import { buildPushSchedule } from './pushSchedule'

/**
 * Closed-app reminders via Web Push.
 *
 * A closed PWA can't run a timer, so something off the device has to wake it.
 * The device subscribes to its browser vendor's push service (anonymous — no
 * account, no login) and uploads its upcoming reminder *times* to the app's own
 * server (netlify/functions), which sends an empty-of-content push at each one.
 * Compound names and doses never leave the device: the push carries only an
 * opaque tag, and the service worker (public/sw-notifications.js) rebuilds the
 * notification text from the local database.
 *
 * Off unless a VAPID public key was provided at build time
 * (VITE_VAPID_PUBLIC_KEY) — without one the app behaves exactly as before, with
 * reminders while it is open. Every failure path degrades to that.
 */

const PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY
const SCHEDULE_URL = '/api/push/schedule'
const ACTIVE_FLAG = 'peptidescr.pushActive'
const SYNC_DEBOUNCE_MS = 1500

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Whether the server currently holds this device's reminders — in which case the on-open fallback stands down so a dose isn't announced twice. */
export function isPushActive(): boolean {
  try {
    return localStorage.getItem(ACTIVE_FLAG) === '1'
  } catch {
    return false
  }
}

function setPushActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(ACTIVE_FLAG, '1')
    else localStorage.removeItem(ACTIVE_FLAG)
  } catch {
    // Private mode etc.: the flag only optimises away duplicate alerts.
  }
}

function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function getOrCreateSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeKey(PUBLIC_KEY!),
  })
}

/**
 * Subscribes this device if needed and replaces its stored reminder list with
 * the current one. Idempotent; safe to call any time. Only acts once the user
 * has granted notification permission.
 */
export async function syncPushSchedule(): Promise<void> {
  if (!isPushConfigured() || Notification.permission !== 'granted') return
  try {
    const subscription = await getOrCreateSubscription()
    if (!subscription) return

    const [protocols, doseLogs] = await Promise.all([db.protocols.toArray(), db.doseLogs.toArray()])
    const items = buildPushSchedule(protocols, doseLogs, new Date())
    const response = await fetch(SCHEDULE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), items }),
    })
    setPushActive(response.ok)
  } catch (err) {
    // A network failure (offline) leaves the last known state alone and is
    // retried on the next open. Anything else means push isn't working here.
    if (!(err instanceof TypeError)) setPushActive(false)
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Debounced `syncPushSchedule`, for callers that change reminders in bursts
 * (saving a protocol, then logging a dose) and don't need to wait on it.
 */
export function requestPushSync(): void {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void syncPushSchedule(), SYNC_DEBOUNCE_MS)
}
