import { CalendarClock, CalendarCheck, MoveRight, Timer } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { OptionCard } from '@/components/ui/option-card'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, formatDateTime } from '../lib/dates'
import type { Protocol } from '../lib/db'
import { contextOf } from '../lib/homeData'
import { shiftScheduleTo } from '../lib/lateDose'
import { getNextOccurrence, type Occurrence } from '../lib/schedule'

export interface LateDoseChoice {
  /** When the dose was taken. */
  at: Date
  /** Changes to apply to the protocol so future doses follow this one; null to keep the schedule. */
  shift: Partial<Protocol> | null
}

/**
 * Asked when a dose from an earlier day is logged from Catch up, on a
 * schedule where a late dose still counts for its slot (weekly, every few
 * days — see matchLogsToOccurrences): was it taken on time and only logged
 * now, or taken now? Taken now, a once-a-week or every-N-days schedule can
 * also move to follow it. Mounted only while open.
 */
export function LateDoseSheet({
  protocol,
  occurrence,
  onCancel,
  onConfirm,
}: {
  protocol: Protocol
  occurrence: Occurrence
  onCancel: () => void
  onConfirm: (choice: LateDoseChoice) => void
}) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => new Date())
  const [when, setWhen] = useState<'scheduled' | 'now'>('now')
  const [move, setMove] = useState(false)
  const shift = shiftScheduleTo(protocol, now)

  // What "next dose" becomes either way, with the dose just logged counted.
  const nextKeep = getNextOccurrence(contextOf(protocol), now, [now])
  const nextMoved = shift ? getNextOccurrence(contextOf({ ...protocol, ...shift }), now, [now]) : null
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(now)
  const moveLabel =
    protocol.schedule.kind === 'weekdays' ? t('late.moveWeekday', { weekday }) : t('late.moveInterval')

  return (
    <Sheet open onOpenChange={(open) => !open && onCancel()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('late.title')}</SheetTitle>
          <SheetDescription>{t('late.body', { date: formatDateTime(occurrence.scheduledAt) })}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          <OptionCard
            icon={Timer}
            label={t('late.now')}
            description={formatDateTime(now)}
            selected={when === 'now'}
            onSelect={() => setWhen('now')}
          />
          <OptionCard
            icon={CalendarCheck}
            label={t('late.onSchedule')}
            description={formatDateTime(occurrence.scheduledAt)}
            selected={when === 'scheduled'}
            onSelect={() => setWhen('scheduled')}
          />

          {when === 'now' && shift && (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">{t('late.nextDoses')}</p>
              <OptionCard
                icon={CalendarClock}
                label={t('late.keep')}
                description={nextKeep ? t('late.nextOn', { date: formatDate(nextKeep.scheduledAt) }) : undefined}
                selected={!move}
                onSelect={() => setMove(false)}
              />
              <OptionCard
                icon={MoveRight}
                label={moveLabel}
                description={nextMoved ? t('late.nextOn', { date: formatDate(nextMoved.scheduledAt) }) : undefined}
                selected={move}
                onSelect={() => setMove(true)}
              />
            </div>
          )}

          <Button
            className="mt-2"
            onClick={() =>
              onConfirm({
                at: when === 'now' ? now : occurrence.scheduledAt,
                shift: when === 'now' && move ? shift : null,
              })
            }
          >
            {t('late.confirm')}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
