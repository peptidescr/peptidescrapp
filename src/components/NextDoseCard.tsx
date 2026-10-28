import { ChevronRight, ClipboardList, Syringe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime } from '../lib/dates'
import type { DueItem } from '../lib/homeData'
import { describeNextUp } from '../lib/nextUp'
import type { Protocol } from '../lib/db'
import type { Occurrence } from '../lib/schedule'
import { doseOn, formatDose } from '../lib/titration'
import { isSameDay } from 'date-fns'
import { LogButtons } from './DoseCard'

type Tone = 'missed' | 'due' | 'upcoming'

const TONE_TEXT: Record<Tone, string> = {
  missed: 'text-destructive',
  due: 'text-primary',
  upcoming: 'text-muted-foreground',
}

/**
 * Home's "Next dose" card, the one that straddles the hero band: the dose that
 * needs you next, when, and Taken / Skipped to log it in one tap. That is the
 * soonest due or missed dose if there is one, otherwise the next one coming up.
 * A link under it opens Track > Today for the rest of the day.
 *
 * With nothing scheduled it says so and points at Protocols, the place to set
 * one up, instead of leaving a blank gap under the hero.
 */
export function NextDoseCard({
  dueItems,
  upcoming,
  now,
  hasActiveProtocols,
  onOpenToday,
  onOpenProtocols,
}: {
  dueItems: DueItem[]
  upcoming: { protocol: Protocol; occurrence: Occurrence }[]
  now: Date
  hasActiveProtocols: boolean
  onOpenToday: () => void
  onOpenProtocols: () => void
}) {
  const { t } = useTranslation()
  const due = dueItems[0]
  const coming = due ? undefined : upcoming[0]

  if (!due && !coming) {
    return (
      <Card padded className="flex flex-col gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-tint text-primary">
            <ClipboardList className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold leading-snug text-foreground">
              {hasActiveProtocols ? t('home.noUpcomingTitle') : t('home.noProtocolsTitle')}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasActiveProtocols ? t('home.noUpcomingBody') : t('home.nextDoseEmptyBody')}
            </p>
          </div>
        </div>
        <Button variant="tint" onClick={onOpenProtocols} fullWidth>
          {t('home.nextDoseEmptyCta')}
        </Button>
      </Card>
    )
  }

  const protocol = (due ?? coming)!.protocol
  const occurrence = (due ?? coming)!.occurrence
  const compound = getCompoundById(protocol.compoundId)

  let tone: Tone
  let status: string
  let showActions = true
  if (due) {
    tone = due.isMissed ? 'missed' : 'due'
    const dayWord = isSameDay(occurrence.scheduledAt, now) ? t('home.today') : formatDate(occurrence.scheduledAt)
    status = `${due.isMissed ? t('home.missedLabel') : t('home.dueLabel')} · ${dayWord}`
  } else {
    tone = 'upcoming'
    const next = describeNextUp(protocol, occurrence, now, t)
    status = next.statusLabel
    showActions = next.canLogNow
  }
  const moreDue = Math.max(0, dueItems.length - (due ? 1 : 0))

  return (
    <Card padded className="flex flex-col gap-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-tint text-primary">
          <Syringe className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t('home.nextDoseTitle')}</p>
          <p className="truncate font-display text-[15px] font-bold leading-snug text-foreground">
            {protocol.name || compound?.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDose(doseOn(protocol, occurrence.scheduledAt))} · {t(`route.${protocol.route}`)}
          </p>
        </div>
        <span className="shrink-0 font-display text-base font-bold tabular-nums text-foreground">
          {formatTime(occurrence.scheduledAt)}
        </span>
      </div>

      <p className={cn('flex items-center gap-2 text-sm font-semibold', TONE_TEXT[tone])}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
        <span className="min-w-0">{status}</span>
      </p>

      {showActions && (
        <LogButtons
          protocol={protocol}
          administeredAt={due ? occurrence.scheduledAt : undefined}
          lateOccurrence={due ? occurrence : undefined}
        />
      )}

      <button
        type="button"
        onClick={onOpenToday}
        className="-mx-1 -mb-1 flex min-h-11 items-center justify-between gap-2 rounded-xl border-t border-border/60 px-1 pt-1 text-left text-sm font-bold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          {t('home.nextDoseSeeToday')}
          {moreDue > 0 && (
            <span className="font-medium text-muted-foreground"> · {t('home.nextDoseMoreDue', { count: moreDue })}</span>
          )}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0" />
      </button>
    </Card>
  )
}
