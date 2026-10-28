/**
 * Everything Home and Track > Today derive from the device's own data: the
 * protocols, dose logs and vials, and what they say is due, coming up or in
 * need of attention. It used to live inside HomeScreen; both screens read it
 * now, so it is one hook rather than two copies of the same queries.
 *
 * The notification count lives here for the same reason it did before: the
 * bell's badge and the panel it opens are computed from the same signals, so
 * they can never disagree.
 */
import { startOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { db } from './db'
import {
  computeDoseChanges,
  computeDueItems,
  computeGetStartedSteps,
  computeOverallAdherence,
  computeRecentActivity,
  computeShowBackupNudge,
  computeStreakDays,
  computeTodayProgress,
  computeTodayStatus,
  computeUpcoming,
} from './homeData'
import { getNotificationCapability } from './notifications'
import { todayKey } from './results'
import { useLiveQuery } from './useLiveQuery'
import { useSettings } from './useSettings'
import { computeVialAlerts } from './vials'

export function useHomeState() {
  const settings = useSettings()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const vials = useLiveQuery(() => db.vials.toArray(), [])
  // Whether anything was recorded about today yet — a weight or a check-in.
  const todayKeyValue = todayKey()
  const resultsToday = useLiveQuery(
    async () =>
      (await db.checkIns.get(todayKeyValue)) !== undefined ||
      (await db.weights.where('measuredAt').aboveOrEqual(startOfDay(new Date()).toISOString()).count()) > 0,
    [todayKeyValue],
  )
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const activeProtocols = useMemo(() => (protocols ?? []).filter((p) => p.isActive), [protocols])

  const streakDays = useMemo(
    () => computeStreakDays(now, (doseLogs ?? []).map((log) => new Date(log.administeredAt))),
    [doseLogs, now],
  )

  const dueItems = useMemo(() => computeDueItems(protocols ?? [], doseLogs ?? [], now), [protocols, doseLogs, now])

  const todayProgress = useMemo(
    () => computeTodayProgress(protocols ?? [], doseLogs ?? [], now),
    [protocols, doseLogs, now],
  )
  const todayStatus = useMemo(() => computeTodayStatus(todayProgress), [todayProgress])

  // The whole "up next" queue, not just the single soonest — one card per
  // active protocol so a second protocol isn't invisible until the first one's
  // dose is logged.
  const upcoming = useMemo(
    () => computeUpcoming(protocols ?? [], doseLogs ?? [], now),
    [protocols, doseLogs, now],
  )

  const recentActivity = useMemo(() => computeRecentActivity(doseLogs ?? []), [doseLogs])

  const vialAlerts = useMemo(
    () => computeVialAlerts(vials ?? [], protocols ?? [], doseLogs ?? [], now),
    [vials, protocols, doseLogs, now],
  )
  const doseChanges = useMemo(() => computeDoseChanges(protocols ?? [], now), [protocols, now])
  const adherence = useMemo(
    () => computeOverallAdherence(protocols ?? [], doseLogs ?? [], now),
    [protocols, doseLogs, now],
  )

  const getStartedSteps = useMemo(
    () => computeGetStartedSteps(protocols ?? [], doseLogs ?? [], settings),
    [protocols, doseLogs, settings],
  )
  const showGetStarted =
    protocols !== undefined && !settings?.getStartedDismissedAt && getStartedSteps.some((step) => !step.done)

  const showBackupNudge = useMemo(
    () => computeShowBackupNudge(protocols ?? [], doseLogs ?? [], settings, now),
    [protocols, doseLogs, settings, now],
  )

  // Same signals the notification panel itself uses to decide what to show —
  // kept in lockstep so the bell's badge count always matches what's actually
  // inside the panel it opens.
  const capability = getNotificationCapability()
  const notifNudgeCount =
    capability.supported && (capability.requiresInstallOnIOS || capability.permission === 'default') ? 1 : 0
  const notificationCount =
    dueItems.length + vialAlerts.length + doseChanges.length + (showBackupNudge ? 1 : 0) + notifNudgeCount

  return {
    settings,
    protocols,
    doseLogs,
    vials,
    resultsToday,
    now,
    activeProtocols,
    streakDays,
    dueItems,
    todayProgress,
    todayStatus,
    upcoming,
    recentActivity,
    vialAlerts,
    doseChanges,
    adherence,
    getStartedSteps,
    showGetStarted,
    showBackupNudge,
    notificationCount,
  }
}

export type HomeState = ReturnType<typeof useHomeState>
