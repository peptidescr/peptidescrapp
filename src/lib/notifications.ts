import { getCompoundById } from '../content/compounds'
import type { Protocol } from './db'
import { isIOS, isStandalone } from './platform'
import { getOccurrencesInRange, type ScheduleContext } from './schedule'

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
  return Notification.requestPermission()
}

const REMINDER_WINDOW_HOURS = 48

/**
 * Best-effort only: schedules Chromium Notification Triggers for the next
 * ~48h of active-protocol occurrences. No-ops silently wherever the browser
 * doesn't support triggers (iOS Safari, Firefox, and most of Chrome's own
 * history — this API has shipped only behind flags/origin trials). The
 * reliable mechanism for this app is the on-open catch-up on Home; this is
 * a bonus for the narrow slice of devices where it works, never something
 * the UI should claim as guaranteed. Re-run on every app open — showing a
 * notification again with the same tag replaces the pending one, so this is
 * safe to call repeatedly without piling up duplicates.
 */
export async function scheduleUpcomingReminders(protocols: Protocol[]): Promise<void> {
  const capability = getNotificationCapability()
  if (!capability.supported || capability.permission !== 'granted' || !capability.triggersSupported) {
    return
  }
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const TimestampTrigger = (window as unknown as { TimestampTrigger: TimestampTriggerLike }).TimestampTrigger

  const now = new Date()
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000)

  for (const protocol of protocols.filter((p) => p.isActive)) {
    const compound = getCompoundById(protocol.compoundId)
    const ctx: ScheduleContext = {
      schedule: protocol.schedule,
      startDate: protocol.startDate,
      endDate: protocol.endDate,
      reminderTimes: protocol.reminderTimes,
    }
    for (const occurrence of getOccurrencesInRange(ctx, now, horizon)) {
      try {
        await registration.showNotification(protocol.name || compound?.name || 'peptidescr', {
          tag: `${protocol.id}-${occurrence.scheduledAt.toISOString()}`,
          // @ts-expect-error showTrigger isn't in TS's NotificationOptions yet
          showTrigger: new TimestampTrigger(occurrence.scheduledAt.getTime()),
        })
      } catch {
        // Best effort — a single failed schedule shouldn't block the rest.
      }
    }
  }
}
