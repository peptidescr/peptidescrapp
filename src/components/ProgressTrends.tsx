import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCompoundById } from '../content/compounds'
import { db } from '../lib/db'
import {
  defaultFocusProtocol,
  rangeStart,
  resultsByDoseStep,
  resultsBySite,
  sideEffectTimeline,
  stepOn,
  stepsShaded,
  weightPoints,
  type ChartRange,
} from '../lib/progressCharts'
import type { Symptom, WeightUnit } from '../lib/results'
import { weightIn } from '../lib/results'
import { useLiveQuery } from '../lib/useLiveQuery'
import { DoseStepTable, SideEffectTimelineChart, SiteTable, WeightDoseChart } from './ProgressCharts'

/**
 * The charts that connect results to doses (Tier 1 #2), under one filter row:
 * a time range and — when there's more than one protocol — which protocol's
 * dose steps to colour by. Every chart and table below follows both.
 */
export function ProgressTrends({
  unit,
  goalGrams,
  symptoms,
  fmt,
}: {
  unit: WeightUnit
  goalGrams: number | null
  symptoms: Symptom[]
  fmt: (grams: number) => string
}) {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const weights = useLiveQuery(() => db.weights.toArray(), [])
  const checkIns = useLiveQuery(() => db.checkIns.toArray(), [])
  const [range, setRange] = useState<ChartRange>('90d')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const withDoses = useMemo(
    () => (protocols ?? []).filter((p) => (doseLogs ?? []).some((l) => l.protocolId === p.id && l.status === 'taken')),
    [protocols, doseLogs],
  )
  const focus =
    (protocols ?? []).find((p) => p.id === focusId) ?? defaultFocusProtocol(protocols ?? [], doseLogs ?? [])

  const earliest = useMemo(() => {
    const times = [...(weights ?? []).map((w) => w.measuredAt), ...(checkIns ?? []).map((c) => `${c.date}T12:00:00`)]
    return times.length ? new Date(times.sort()[0]!) : null
  }, [weights, checkIns])
  const from = useMemo(() => rangeStart(range, now, earliest), [range, now, earliest])

  const points = useMemo(() => weightPoints(weights ?? [], focus, from, now), [weights, focus, from, now])
  const timeline = useMemo(
    () => sideEffectTimeline(checkIns ?? [], doseLogs ?? [], focus, from, now),
    [checkIns, doseLogs, focus, from, now],
  )
  const doseResults = useMemo(
    () => (focus ? resultsByDoseStep(focus, weights ?? [], checkIns ?? [], now) : []),
    [focus, weights, checkIns, now],
  )
  const siteResults = useMemo(() => resultsBySite(doseLogs ?? [], checkIns ?? [], from), [doseLogs, checkIns, from])
  // One shading for every chart: the steps seen in the weights, the timeline and the per-step results.
  const steps = useMemo(
    () =>
      stepsShaded([
        ...points.map((p) => stepOn(focus, p.at)),
        ...timeline.columns.filter((c) => c.doses > 0).map((c) => stepOn(focus, c.from)),
        ...doseResults.map((r) => ({ key: r.key, amount: r.amount, unit: r.unit })),
      ]),
    [points, timeline, doseResults, focus],
  )

  const toUnit = (grams: number) => weightIn(grams, unit)
  const fmtChange = (grams: number) => (grams === 0 ? fmt(0) : `${grams > 0 ? '+' : '−'}${fmt(Math.abs(grams))}`)
  const hasTimeline = timeline.symptoms.length > 0 || timeline.columns.some((c) => c.doses > 0)

  if ((weights ?? []).length === 0 && (checkIns ?? []).length === 0 && withDoses.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{t('charts.title')}</h2>
      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-col gap-2">
        <Segmented<ChartRange>
          ariaLabel={t('charts.range')}
          className="[&>button]:whitespace-nowrap [&>button]:px-1"
          value={range}
          onChange={setRange}
          options={[
            { value: '30d', label: t('charts.range30') },
            { value: '90d', label: t('charts.range90') },
            { value: '6m', label: t('charts.range6m') },
            { value: 'all', label: t('charts.rangeAll') },
          ]}
        />
        {withDoses.length > 1 && focus && (
          <Select value={focus.id} onValueChange={setFocusId}>
            <SelectTrigger aria-label={t('charts.focus')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {withDoses.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {t('charts.focusOption', { name: p.name || getCompoundById(p.compoundId)?.name || '' })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ChartCard title={t('charts.weightByDose')} subtitle={focus ? t('charts.weightByDoseBody') : undefined}>
        <WeightDoseChart points={points} steps={steps} from={from} to={now} goalGrams={goalGrams} toUnit={toUnit} fmt={fmt} />
      </ChartCard>

      {doseResults.length > 0 && (
        <ChartCard title={t('charts.byDose')} subtitle={t('charts.byDoseBody')}>
          <DoseStepTable results={doseResults} steps={steps} fmtChange={fmtChange} />
        </ChartCard>
      )}

      {hasTimeline && (
        <ChartCard title={t('charts.timeline')} subtitle={t('charts.timelineBody')}>
          <SideEffectTimelineChart timeline={timeline} steps={steps} symptoms={symptoms} />
        </ChartCard>
      )}

      {siteResults.length > 0 && (
        <ChartCard title={t('charts.bySite')} subtitle={t('charts.bySiteBody')}>
          <SiteTable results={siteResults} />
        </ChartCard>
      )}
    </section>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  )
}
