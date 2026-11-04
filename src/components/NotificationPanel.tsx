import { isSameDay } from 'date-fns'
import { BellRing, CheckCircle2, Settings, Syringe } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { NoticeRow } from '@/components/ui/notice-row'
import { SectionLabel } from '@/components/ui/section-label'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getCompoundById } from '../content/compounds'
import { BackupNudge } from './BackupNudge'
import { LogButtons } from './DoseCard'
import { DoseChangeCard } from './DoseChangeCard'
import { VialAlertCard } from './VialAlertCard'
import { formatDate, formatTime } from '../lib/dates'
import type { DoseLog, Protocol, Settings as AppSettings } from '../lib/db'
import { computeDueItems, computeShowBackupNudge, type DoseChangeItem, type DueItem } from '../lib/homeData'
import { getNotificationCapability, requestNotificationPermission } from '../lib/notifications'
import { doseOn, formatDose } from '../lib/titration'
import { vialAlertKey, type VialAlert } from '../lib/vials'

interface NotificationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  protocols: Protocol[]
  doseLogs: DoseLog[]
  /** Computed once by Home, so the bell's count and this list can't disagree. */
  vialAlerts: VialAlert[]
  /** Titration steps about to change a dose — also computed once by Home, for the same reason. */
  doseChanges: DoseChangeItem[]
  settings: AppSettings | undefined
  now: Date
  onNavigateToSettings: () => void
  /** Taps a due/missed card: straight to that protocol's own edit page. */
  onOpenProtocol: (protocolId: string) => void
}

type GroupId = 'doses' | 'vials' | 'changes' | 'reminders'
type Filter = 'all' | GroupId

/**
 * The bell's panel: what needs attention right now, built from data the app
 * already derives (no fabricated unread count, no fake history). It is a bottom
 * sheet like the app's other lists, and every row is the same shape (NoticeRow)
 * so it reads as one list: sections in order of urgency (doses due or missed,
 * then vials, dose changes, and reminders such as backing up), filter chips
 * with counts to jump to one kind, and a way into the notification settings.
 */
export function NotificationPanel({
  open,
  onOpenChange,
  protocols,
  doseLogs,
  vialAlerts,
  doseChanges,
  settings,
  now,
  onNavigateToSettings,
  onOpenProtocol,
}: NotificationPanelProps) {
  const { t } = useTranslation()
  const [requesting, setRequesting] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const dueItems = computeDueItems(protocols, doseLogs, now)
  const showBackupNudge = computeShowBackupNudge(protocols, doseLogs, settings, now)
  const capability = getNotificationCapability()
  const showEnableNudge = capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default'
  const showIosNudge = capability.requiresInstallOnIOS
  const reminderCount = Number(showEnableNudge) + Number(showIosNudge) + Number(showBackupNudge)

  const groups: { id: GroupId; label: string; count: number }[] = [
    { id: 'doses' as const, label: t('notifications.doses'), count: dueItems.length },
    { id: 'vials' as const, label: t('notifications.vials'), count: vialAlerts.length },
    { id: 'changes' as const, label: t('notifications.changes'), count: doseChanges.length },
    { id: 'reminders' as const, label: t('notifications.reminders'), count: reminderCount },
  ].filter((g) => g.count > 0)
  const total = groups.reduce((sum, g) => sum + g.count, 0)
  // A filter whose group has since emptied (a dose was just logged) falls back to everything.
  const active: Filter = groups.some((g) => g.id === filter) ? filter : 'all'
  const shows = (id: GroupId) => groups.some((g) => g.id === id) && (active === 'all' || active === id)

  function goToProtocol(protocolId: string) {
    onOpenChange(false)
    onOpenProtocol(protocolId)
  }

  function goToSettings() {
    onOpenChange(false)
    onNavigateToSettings()
  }

  async function handleEnableNotifications() {
    setRequesting(true)
    try {
      await requestNotificationPermission()
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setFilter('all')
        onOpenChange(next)
      }}
    >
      <SheetContent>
        <SheetHeader className="pr-14">
          <SheetTitle>{t('settings.notifications')}</SheetTitle>
          <SheetDescription>{total > 0 ? t('notifications.summary', { count: total }) : t('notifications.description')}</SheetDescription>
        </SheetHeader>

        {groups.length > 1 && (
          <div role="group" aria-label={t('notifications.filterLabel')} className="flex shrink-0 flex-wrap gap-2 px-5 pb-3">
            <Chip selected={active === 'all'} onClick={() => setFilter('all')} className="px-3 text-[13px]">
              {t('notifications.all')} <span className="tabular-nums opacity-75">{total}</span>
            </Chip>
            {groups.map((g) => (
              <Chip key={g.id} selected={active === g.id} onClick={() => setFilter(g.id)} className="px-3 text-[13px]">
                {g.label} <span className="tabular-nums opacity-75">{g.count}</span>
              </Chip>
            ))}
          </div>
        )}

        <SheetBody className="flex flex-col gap-5 pt-1">
          {shows('doses') && (
            <Section label={t('notifications.doses')} count={dueItems.length}>
              {dueItems.map((item) => (
                <DoseNotice key={`${item.protocol.id}-${item.occurrence.scheduledAt.toISOString()}`} item={item} now={now} onOpen={goToProtocol} />
              ))}
            </Section>
          )}

          {shows('vials') && (
            <Section label={t('notifications.vials')} count={vialAlerts.length}>
              {vialAlerts.map((alert) => (
                <VialAlertCard key={vialAlertKey(alert)} alert={alert} onOpenProtocol={goToProtocol} />
              ))}
            </Section>
          )}

          {shows('changes') && (
            <Section label={t('notifications.changes')} count={doseChanges.length}>
              {doseChanges.map((item) => (
                <DoseChangeCard key={item.protocol.id} item={item} now={now} onOpenProtocol={goToProtocol} />
              ))}
            </Section>
          )}

          {shows('reminders') && (
            <Section label={t('notifications.reminders')} count={reminderCount}>
              {showEnableNudge && (
                <NoticeRow icon={BellRing} tone="info" title={t('notifications.enableNudgeTitle')} subtitle={t('notifications.enableNudgeBody')}>
                  <Button size="sm" disabled={requesting} onClick={() => void handleEnableNotifications()} className="self-start">
                    {t('settings.notif.enable')}
                  </Button>
                </NoticeRow>
              )}
              {showIosNudge && (
                <NoticeRow icon={BellRing} tone="info" title={t('notifications.enableNudgeTitle')} subtitle={t('settings.notif.needsInstallIOS')} />
              )}
              {showBackupNudge && <BackupNudge onOpen={goToSettings} />}
            </Section>
          )}

          {total === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 aria-hidden className="size-8 text-primary" />
              <p className="font-display text-sm font-semibold text-foreground">{t('notifications.emptyTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('notifications.emptyBody')}</p>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={goToSettings} className="self-center text-muted-foreground">
            <Settings />
            {t('notifications.manage')}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/** A headed list of notices: the heading says what kind and how many. */
function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel note={count}>{label}</SectionLabel>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

/**
 * A dose that is due or missed, in the panel's notice shape: the status line in
 * the tone, the protocol and its dose, a tap to open the protocol, and Taken /
 * Skipped underneath (the same buttons, and the same late-dose question, as
 * Today's cards).
 */
function DoseNotice({ item, now, onOpen }: { item: DueItem; now: Date; onOpen: (protocolId: string) => void }) {
  const { t } = useTranslation()
  const { protocol, occurrence, isMissed } = item
  const at = occurrence.scheduledAt
  const dayWord = isSameDay(at, now) ? t('home.today') : formatDate(at)
  return (
    <NoticeRow
      icon={Syringe}
      tone={isMissed ? 'missed' : 'due'}
      meta={`${isMissed ? t('home.missedLabel') : t('home.dueLabel')} · ${dayWord} · ${formatTime(at)}`}
      title={protocol.name || getCompoundById(protocol.compoundId)?.name}
      subtitle={`${formatDose(doseOn(protocol, at))} · ${t(`route.${protocol.route}`)}`}
      onClick={() => onOpen(protocol.id)}
    >
      <LogButtons protocol={protocol} administeredAt={at} lateOccurrence={occurrence} />
    </NoticeRow>
  )
}
