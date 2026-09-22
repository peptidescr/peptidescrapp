import { isSameDay } from 'date-fns'
import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime } from '../lib/dates'
import type { Protocol } from '../lib/db'
import { logProtocolDose } from '../lib/doseLog'
import type { DueItem } from '../lib/homeData'

export function LogButtons({
  protocol,
  administeredAt,
}: {
  protocol: Protocol
  /**
   * Fixed timestamp to log against — pass the occurrence's own scheduledAt
   * for something already due (Catch up). Omit it to log against the actual
   * moment of the tap instead, which is what "logging ahead of schedule"
   * (e.g. Home's Next up card) means: taken/skipped *now*, not at its future
   * reminder time.
   */
  administeredAt?: Date
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function handle(status: 'taken' | 'skipped') {
    setBusy(true)
    try {
      await logProtocolDose(protocol, status, administeredAt ?? new Date())
      toast.success(status === 'taken' ? t('home.toastTaken') : t('home.toastSkipped'))
    } finally {
      setBusy(false)
    }
  }

  // Taken is the action nearly everyone is here for, so it gets twice the
  // width and the only filled button; Skipped is a quiet outline beside it.
  return (
    <div className="flex gap-2">
      <Button disabled={busy} onClick={() => handle('taken')} className="flex-[2] text-sm font-semibold">
        <Check />
        {t('home.logTaken')}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => handle('skipped')}
        className="flex-1 text-sm text-muted-foreground"
      >
        {t('home.logSkipped')}
      </Button>
    </div>
  )
}

export type DoseCardTone = 'missed' | 'due' | 'upcoming'

const TONE_TEXT: Record<DoseCardTone, string> = {
  missed: 'text-destructive',
  due: 'text-primary',
  upcoming: 'text-muted-foreground',
}

/**
 * Shared shell for every due/upcoming dose — Home's Catch-up and Next-up
 * sections and the notification panel. It answers three questions in order:
 * where does this stand (a coloured status line and the time), what is it (the
 * protocol and its dose), and what do I do (log it). Nothing else competes:
 * the per-protocol totals and the "view protocol" link that used to sit here
 * live on the Protocols screen, and the name row itself is the way there.
 *
 * Only the tone changes the look — missed reads red, due reads in the accent,
 * upcoming stays grey — so a glance down the list sorts itself by urgency.
 */
export function DoseCard({
  tone,
  statusLabel,
  time,
  protocol,
  compoundName,
  showActions,
  administeredAt,
  onOpenProtocol,
}: {
  tone: DoseCardTone
  statusLabel: string
  time: Date
  protocol: Protocol
  compoundName: string | undefined
  showActions: boolean
  administeredAt?: Date
  /** Taps the name row: straight to this protocol's own edit page, not just the Protocols list. */
  onOpenProtocol: (protocolId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Card
      className={
        // --destructive-glow is a dark-mode "lit" glow on the dark block,
        // replaced with a ring + tint on the light block — see tokens.css,
        // which is why this reads via the CSS var rather than a literal shadow.
        tone === 'missed' ? 'border-destructive/40 shadow-[var(--destructive-glow)]' : undefined
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`flex min-w-0 items-center gap-2 text-sm font-medium ${TONE_TEXT[tone]}`}>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
            <span className="min-w-0">{statusLabel}</span>
          </p>
          <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-foreground">
            {formatTime(time)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenProtocol(protocol.id)}
          className="-my-1 flex min-h-11 items-center justify-between gap-3 py-1 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold leading-tight text-foreground">
              {protocol.name || compoundName}
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {protocol.doseAmount} {protocol.doseUnit} · {t(`route.${protocol.route}`)}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        </button>

        {showActions && <LogButtons protocol={protocol} administeredAt={administeredAt} />}
      </div>
    </Card>
  )
}

/** A due or missed occurrence, rendered identically wherever it shows up (Home, notification panel). */
export function DueCard({
  item,
  now,
  onOpenProtocol,
}: {
  item: DueItem
  now: Date
  onOpenProtocol: (protocolId: string) => void
}) {
  const { t } = useTranslation()
  const compound = getCompoundById(item.protocol.compoundId)
  const dayWord = isSameDay(item.occurrence.scheduledAt, now) ? t('home.today') : formatDate(item.occurrence.scheduledAt)
  const label = item.isMissed ? t('home.missedLabel') : t('home.dueLabel')

  return (
    <DoseCard
      tone={item.isMissed ? 'missed' : 'due'}
      statusLabel={`${label} · ${dayWord}`}
      time={item.occurrence.scheduledAt}
      protocol={item.protocol}
      compoundName={compound?.name}
      showActions
      administeredAt={item.occurrence.scheduledAt}
      onOpenProtocol={onOpenProtocol}
    />
  )
}
