import { getCompoundById } from '../content/compounds'
import i18n from '../i18n'
import { formatClock } from './dates'
import { db, type Protocol } from './db'
import { contextOf, loggedTimesFor } from './homeData'
import { isIOS, isStandalone } from './platform'
import { isPushActive, requestPushSync, syncPushSchedule } from './push'
import { reminderTag } from './pushSchedule'
import { findUnloggedOccurrences, getOccurrencesInRange, type Occurrence } from './schedule'

/** Ambient ref for the Chromium-only Notification Triggers proposal — not in TS's lib.dom.d.ts. */
interface TimestampTriggerLike {
  new (timestamp: number): unknown
}

export interface NotificationCapability {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  isIOS: boolean
  isStandalone: boolean
  /** iOS only allows notifications at all once the app is added to the Home Screen (iOS 16.4+). */
  requiresInstallOnIOS: boolean
  /** Chromium-only proposal letting a notification fire at a future time even while the app is fully closed. */
  triggersSupported: boolean
}

export function getNotificationCapability(): NotificationCapability {
  const supported = 'Notification' in window
  const ios = isIOS()
  const standalone = isStandalone()
  return {
    supported,
    permission: supported ? Notification.permission : 'unsupported',
    isIOS: ios,
    isStandalone: standalone,
    requiresInstallOnIOS: ios && !standalone,
    triggersSupported: typeof (window as unknown as { TimestampTrigger?: unknown }).TimestampTrigger !== 'undefined',
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  const permission = await Notification.requestPermission()
  // Subscribe for closed-app reminders straight away, in the same gesture
  // that granted permission (iOS is strict about that). No-op when the push
  // server isn't configured for this build.
  if (permission === 'granted') await syncPushSchedule()
  return permission
}

/** True when a notification can actually be shown right now (permission granted, and iOS is installed). */
export function canShowNotifications(): boolean {
  const capability = getNotificationCapability()
  return capability.supported && capability.permission === 'granted' && !capability.requiresInstallOnIOS
}

interface ReminderContent {
  title: string
  body: string
  tag: string
}

/**
 * Shows a notification through the service worker registration when there is
 * one. That is the only route that works on Android Chrome (which throws on
 * `new Notification()`) and for installed iOS PWAs; the plain constructor is
 * a fallback for desktop browsers with no registered worker (dev builds).
 *
 * `getRegistration()` rather than `serviceWorker.ready`: `ready` never
 * resolves when no worker is registered, which would hang the caller forever
 * instead of falling back.
 */
async function showNotification({ title, body, tag }: ReminderContent): Promise<boolean> {
  if (!canShowNotifications()) return false
  const options: NotificationOptions = {
    body,
    tag,
    icon: '/brand/icon-192.png',
    badge: '/brand/icon-192.png',
  }
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) {
      await registration.showNotification(title, options)
    } else {
      new Notification(title, options)
    }
    return true
  } catch {
    return false
  }
}

export function sendTestNotification(): Promise<boolean> {
  return showNotification({
    title: i18n.t('settings.notif.testTitle'),
    body: i18n.t('settings.notif.testBody'),
    tag: 'peptidescr-test',
  })
}

function contentFor(protocol: Protocol, occurrence: Occurrence): ReminderContent {
  const compound = getCompoundById(protocol.compoundId)
  const name = protocol.name || compound?.name || 'peptidescr'
  return {
    title: name,
    body: i18n.t('notifications.doseDueBody', {
      dose: `${protocol.doseAmount} ${protocol.doseUnit}`,
      time: formatClock(occurrence.time),
    }),
    tag: reminderTag(protocol.id, occurrence.scheduledAt),
  }
}

// ---------------------------------------------------------------------------
// Foreground reminders
// ---------------------------------------------------------------------------

const NOTIFIED_STORAGE_KEY = 'peptidescr.notifiedReminders'
const NOTIFIED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000
/** How long after its time a dose still gets a notification — covers a phone that was asleep or the app suspended at the exact minute. */
const LATE_GRACE_MS = 90 * 60 * 1000
const CHECK_INTERVAL_MS = 30_000

/** tag → when it was notified (epoch ms). localStorage can throw or be absent (private mode), so every access is guarded. */
function readNotified(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOTIFIED_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function writeNotified(map: Record<string, number>): void {
  try {
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Worst case a reminder can repeat on the next check; never worth failing over.
  }
}

/**
 * Fires a notification for every active-protocol dose that has come due in
 * the last LATE_GRACE_MS, hasn't been logged, and hasn't already been
 * notified. Called on a timer and whenever the app returns to the foreground,
 * so it works on every platform that can show a notification at all — unlike
 * scheduling (below), which needs a browser feature almost none ship.
 *
 * This only runs while the app is open or backgrounded-but-alive. A fully
 * closed PWA can't be woken by a timer — that's what the push server is for
 * (see push.ts). When it is holding this device's reminders it delivers all of
 * them, including these, so this stands down rather than announce a dose twice.
 */
export async function notifyDueReminders(now: Date = new Date()): Promise<void> {
  if (!canShowNotifications() || isPushActive()) return

  const [protocols, doseLogs] = await Promise.all([db.protocols.toArray(), db.doseLogs.toArray()])
  const notified = readNotified()
  let changed = false

  for (const protocol of protocols) {
    if (!protocol.isActive) continue
    const ctx = contextOf(protocol)
    const windowStart = new Date(now.getTime() - LATE_GRACE_MS)
    const recent = getOccurrencesInRange(ctx, windowStart, now)
    for (const occurrence of findUnloggedOccurrences(recent, loggedTimesFor(protocol, doseLogs))) {
      const content = contentFor(protocol, occurrence)
      if (notified[content.tag]) continue
      // Marked before awaiting so two overlapping checks (timer + visibility
      // change) can't both fire the same reminder.
      notified[content.tag] = now.getTime()
      changed = true
      if (!(await showNotification(content))) delete notified[content.tag]
    }
  }

  for (const [tag, at] of Object.entries(notified)) {
    if (now.getTime() - at > NOTIFIED_RETENTION_MS) {
      delete notified[tag]
      changed = true
    }
  }
  if (changed) writeNotified(notified)
}

/** Starts the reminder checks; returns a function that stops them. Safe to call before permission is granted — checks no-op until it is. */
export function startReminderLoop(): () => void {
  const check = () => void notifyDueReminders()
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    check()
    requestPushSync()
  }

  check()
  requestPushSync()
  const interval = setInterval(check, CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', check)
  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', check)
  }
}

// ---------------------------------------------------------------------------
// Scheduled (closed-app) reminders
// ---------------------------------------------------------------------------

const REMINDER_WINDOW_HOURS = 48

/**
 * Best-effort only: schedules Chromium Notification Triggers for the next
 * ~48h of active-protocol occurrences. No-ops silently wherever the browser
 * doesn't support triggers (iOS Safari, Firefox, and most of Chrome's own
 * history — this API has shipped only behind flags/origin trials). The
 * foreground loop above is what actually delivers reminders for most people;
 * this is a bonus for the narrow slice of devices where it works, and the
 * only thing that can fire with the app fully closed. Re-run on every app
 * open — showing a notification again with the same tag replaces the pending
 * one, so this is safe to call repeatedly without piling up duplicates.
 */
export async function scheduleUpcomingReminders(protocols: Protocol[]): Promise<void> {
  const capability = getNotificationCapability()
  if (!capability.supported || capability.permission !== 'granted' || !capability.triggersSupported) {
    return
  }
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return
  const TimestampTrigger = (window as unknown as { TimestampTrigger: TimestampTriggerLike }).TimestampTrigger

  const now = new Date()
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000)

  for (const protocol of protocols.filter((p) => p.isActive)) {
    for (const occurrence of getOccurrencesInRange(contextOf(protocol), now, horizon)) {
      const { title, body, tag } = contentFor(protocol, occurrence)
      try {
        await registration.showNotification(title, {
          body,
          tag,
          icon: '/brand/icon-192.png',
          badge: '/brand/icon-192.png',
          // @ts-expect-error showTrigger isn't in TS's NotificationOptions yet
          showTrigger: new TimestampTrigger(occurrence.scheduledAt.getTime()),
        })
      } catch {
        // Best effort — a single failed schedule shouldn't block the rest.
      }
    }
  }
}
