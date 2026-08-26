import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../components/EmptyState'
import { getCompoundById } from '../content/compounds'
import { formatTime } from '../lib/dates'
import { db, type Protocol } from '../lib/db'
import { logProtocolDose } from '../lib/doseLog'
import { getDueOccurrences, getNextOccurrence, type Occurrence, type ScheduleContext } from '../lib/schedule'
import { useLiveQuery } from '../lib/useLiveQuery'
import { useSettings } from '../lib/useSettings'

const BACKUP_NUDGE_DAYS = 14
const MISSED_THRESHOLD_HOURS = 12

interface DueItem {
  protocol: Protocol
  occurrence: Occurrence
  isMissed: boolean
}

function contextOf(protocol: Protocol): ScheduleContext {
  return {
    schedule: protocol.schedule,
    startDate: protocol.startDate,
    endDate: protocol.endDate,
    reminderTimes: protocol.reminderTimes,
  }
}

function formatCountdown(
  now: Date,
  target: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return t('home.dueNow')
  const totalMinutes = Math.round(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return t('home.inMinutes', { minutes })
  return t('home.inHoursMinutes', { hours, minutes })
}

export function HomeScreen({ onNavigateToSettings }: { onNavigateToSettings: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const activeProtocols = useMemo(() => (protocols ?? []).filter((p) => p.isActive), [protocols])

  const dueItems: DueItem[] = useMemo(() => {
    if (!doseLogs) return []
    const items: DueItem[] = []
    for (const protocol of activeProtocols) {
      const ctx = contextOf(protocol)
      const loggedTimes = doseLogs
        .filter((log) => log.protocolId === protocol.id)
        .map((log) => new Date(log.administeredAt))
      for (const occurrence of getDueOccurrences(ctx, now, loggedTimes)) {
        const hoursAgo = (now.getTime() - occurrence.scheduledAt.getTime()) / 3_600_000
        items.push({ protocol, occurrence, isMissed: hoursAgo > MISSED_THRESHOLD_HOURS })
      }
    }
    items.sort((a, b) => a.occurrence.scheduledAt.getTime() - b.occurrence.scheduledAt.getTime())
    return items
  }, [activeProtocols, doseLogs, now])

  const nextUp = useMemo(() => {
    let soonest: { protocol: Protocol; occurrence: Occurrence } | null = null
    for (const protocol of activeProtocols) {
      const next = getNextOccurrence(contextOf(protocol), now)
      if (next && (!soonest || next.scheduledAt < soonest.occurrence.scheduledAt)) {
        soonest = { protocol, occurrence: next }
      }
    }
    return soonest
  }, [activeProtocols, now])

  const showBackupNudge =
    !settings?.lastBackupAt ||
    (now.getTime() - new Date(settings.lastBackupAt).getTime()) / (24 * 3_600_000) > BACKUP_NUDGE_DAYS

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-4">
      <h1 className="text-xl font-semibold">{t('nav.home')}</h1>

      {showBackupNudge && (
        <button
          type="button"
          onClick={onNavigateToSettings}
          className="min-h-11 rounded-2xl border border-brand-warn bg-brand-primary-lt px-4 py-3 text-left text-sm text-brand-warn"
        >
          {t('home.backupNudge')}
        </button>
      )}

      {dueItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
            {t('home.catchUpTitle')}
          </h2>
          {dueItems.map((item) => (
            <DueCard key={`${item.protocol.id}-${item.occurrence.scheduledAt.toISOString()}`} item={item} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
          {t('home.nextUpTitle')}
        </h2>
        {nextUp ? (
          <NextUpCard protocol={nextUp.protocol} occurrence={nextUp.occurrence} now={now} />
        ) : (
          <EmptyState title={t('home.noUpcomingTitle')} body={t('home.noUpcomingBody')} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">
          {t('home.activeProtocolsTitle')}
        </h2>
        {activeProtocols.length === 0 ? (
          <EmptyState title={t('home.noProtocolsTitle')} body={t('home.noProtocolsBody')} />
        ) : (
          activeProtocols.map((protocol) => <ActiveProtocolRow key={protocol.id} protocol={protocol} />)
        )}
      </section>
    </div>
  )
}

function LogButtons({ protocol, occurrence }: { protocol: Protocol; occurrence: Occurrence }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function handle(status: 'taken' | 'skipped') {
    setBusy(true)
    try {
      await logProtocolDose(protocol, status, occurrence.scheduledAt)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => handle('taken')}
        className="min-h-11 flex-1 rounded-xl bg-brand-primary text-sm font-semibold text-white disabled:opacity-40"
      >
        {t('home.logTaken')}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => handle('skipped')}
        className="min-h-11 flex-1 rounded-xl border border-brand-border text-sm font-medium text-brand-muted disabled:opacity-40"
      >
        {t('home.logSkipped')}
      </button>
    </div>
  )
}

function DueCard({ item }: { item: DueItem }) {
  const { t } = useTranslation()
  const compound = getCompoundById(item.protocol.compoundId)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-surface p-4">
      <div>
        <p className="font-medium text-brand-ink">{item.protocol.name || compound?.name}</p>
        <p className="text-sm text-brand-muted">
          {formatTime(item.occurrence.scheduledAt)}
          {item.isMissed ? ` · ${t('home.missedLabel')}` : ` · ${t('home.dueLabel')}`}
        </p>
      </div>
      <LogButtons protocol={item.protocol} occurrence={item.occurrence} />
    </div>
  )
}

function NextUpCard({ protocol, occurrence, now }: { protocol: Protocol; occurrence: Occurrence; now: Date }) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-surface p-4">
      <div>
        <p className="font-medium text-brand-ink">{protocol.name || compound?.name}</p>
        <p className="text-2xl font-semibold text-brand-primary">{formatCountdown(now, occurrence.scheduledAt, t)}</p>
        <p className="text-sm text-brand-muted">{formatTime(occurrence.scheduledAt)}</p>
      </div>
      <LogButtons protocol={protocol} occurrence={occurrence} />
    </div>
  )
}

function ActiveProtocolRow({ protocol }: { protocol: Protocol }) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-surface p-4">
      <p className="font-medium text-brand-ink">{protocol.name || compound?.name}</p>
      <p className="text-sm text-brand-muted">
        {compound?.name} · {protocol.doseAmount} {protocol.doseUnit} · {t(`schedule.${protocol.schedule.kind}`)}
      </p>
    </div>
  )
}
