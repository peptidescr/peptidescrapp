import {
  Archive,
  CheckCircle2,
  FlaskConical,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate } from '../lib/dates'
import { db, type DoseLog, type Protocol, type Vial } from '../lib/db'
import { MAX_SPARE_VIALS, sparesOf } from '../lib/reorder'
import type { Locale } from '../lib/units'
import { formatVialAmount } from '../lib/vialText'
import { activeVialFor, closeVial, computeVialAlerts, computeVialState } from '../lib/vials'
import { VialSheet } from './VialSheet'

/**
 * A protocol's vial at a glance: a fill gauge, doses left and how long they
 * last, lot and discard-by date — plus the actions around it. With no vial
 * tracked yet it's a single "Track a vial" link, so the card stays compact.
 */
export function VialStrip({
  protocol,
  vials,
  doseLogs,
}: {
  protocol: Protocol
  vials: Vial[]
  doseLogs: DoseLog[]
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const active = activeVialFor(protocol.id, vials)
  const [sheet, setSheet] = useState<'new' | 'edit' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const view = useMemo(() => {
    if (!active) return null
    const now = new Date()
    const state = computeVialState(active, protocol, doseLogs, now)
    const alerts = computeVialAlerts([active], [protocol], doseLogs, now)
    return { state, attention: alerts.length > 0 }
  }, [active, protocol, doseLogs])

  const sheetEl = (
    <VialSheet
      open={sheet !== null}
      onOpenChange={(open) => !open && setSheet(null)}
      compoundId={protocol.compoundId}
      protocolId={protocol.id}
      vial={sheet === 'edit' ? active : undefined}
      replacesActive={sheet === 'new' && active !== undefined}
    />
  )

  if (!active || !view) {
    if (!protocol.isActive) return null
    return (
      <>
        <button
          type="button"
          onClick={() => setSheet('new')}
          className="mx-4 mt-2 flex min-h-11 items-center gap-2 self-start text-sm font-medium text-primary"
        >
          <FlaskConical className="size-4" />
          {t('vials.trackCta')}
        </button>
        {sheetEl}
      </>
    )
  }

  const { state, attention } = view
  const headline =
    state.remaining <= 0 || state.dosesLeft === 0
      ? t('vials.empty')
      : state.dosesLeft !== null
        ? t('vials.dosesLeft', { count: state.dosesLeft })
        : t('vials.remaining', {
            remaining: formatVialAmount(state.remaining, state.kind, locale),
            total: formatVialAmount(state.total, state.kind, locale),
          })
  const details = [
    state.lastDoseOn ? t('vials.lastDoseOn', { date: formatDate(state.lastDoseOn) }) : null,
    active.discardOn
      ? t('vials.discardLabel', { date: formatDate(new Date(`${active.discardOn}T00:00`)) })
      : null,
    active.lot ? t('vials.lotLabel', { lot: active.lot }) : null,
  ].filter(Boolean)

  async function close(status: 'finished' | 'discarded') {
    setMenuOpen(false)
    await closeVial(active!.id, status)
    toast.success(status === 'finished' ? t('vials.closedFinished') : t('vials.closedDiscarded'))
  }

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-semibold ${attention ? 'text-brand-warn' : 'text-foreground'}`}
          >
            {headline}
          </p>
          {details.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{details.join(' · ')}</p>
          )}
        </div>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('vials.editTitle')}
              className="-mr-2 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            >
              <MoreHorizontal className="size-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1">
            <StripMenuItem
              icon={Pencil}
              label={t('vials.editTitle')}
              onClick={() => {
                setMenuOpen(false)
                setSheet('edit')
              }}
            />
            <StripMenuItem
              icon={Plus}
              label={t('vials.startNextCta')}
              onClick={() => {
                setMenuOpen(false)
                setSheet('new')
              }}
            />
            <StripMenuItem
              icon={CheckCircle2}
              label={t('vials.markFinished')}
              onClick={() => void close('finished')}
            />
            <StripMenuItem
              icon={Archive}
              label={t('vials.markDiscarded')}
              onClick={() => void close('discarded')}
            />
          </PopoverContent>
        </Popover>
      </div>
      {/* Fill gauge: what's left of the starting amount. */}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(state.remainingFraction * 100)}
        aria-label={headline}
      >
        <div
          className={`h-full rounded-full ${attention ? 'bg-brand-warn' : 'bg-primary'}`}
          style={{ width: `${Math.max(0, Math.min(1, state.remainingFraction)) * 100}%` }}
        />
      </div>
      <SpareVials protocol={protocol} />
      {sheetEl}
    </div>
  )
}

/**
 * Unopened (unmixed) vials on hand for this protocol, with a −/+ to keep it
 * true. While there are some, a low vial doesn't nudge a reorder; starting the
 * next vial uses one up (src/lib/reorder.ts).
 */
function SpareVials({ protocol }: { protocol: Protocol }) {
  const { t } = useTranslation()
  const spares = sparesOf(protocol)
  const set = (n: number) => void db.protocols.update(protocol.id, { spareVials: Math.min(Math.max(n, 0), MAX_SPARE_VIALS) })
  const stepClass =
    'flex size-11 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40'
  return (
    <div className="-mb-1 mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{t('vials.spares', { count: spares })}</span>
      <span className="flex items-center">
        <button type="button" aria-label={t('vials.sparesFewer')} disabled={spares === 0} onClick={() => set(spares - 1)} className={stepClass}>
          <Minus className="size-4" />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
          {spares}
        </span>
        <button type="button" aria-label={t('vials.sparesMore')} disabled={spares >= MAX_SPARE_VIALS} onClick={() => set(spares + 1)} className={stepClass}>
          <Plus className="size-4" />
        </button>
      </span>
    </div>
  )
}

function StripMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm text-foreground"
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  )
}
