import { ChevronLeft, Printer } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { BRAND } from '../brand'
import { getCompoundById } from '../content/compounds'
import { scheduleSummary } from '../lib/cycleText'
import { formatDate, formatDateTime } from '../lib/dates'
import { db } from '../lib/db'
import { rangeStart, stepOn, stepsShaded, weightPoints, type ChartRange } from '../lib/progressCharts'
import { buildReport } from '../lib/report'
import { symptomList, weightIn, type WeightUnit } from '../lib/results'
import { symptomName } from '../lib/resultsText'
import { doseOn, formatDose } from '../lib/titration'
import { formatDecimal, iuFromMilliIU, type Locale, type MilliIU } from '../lib/units'
import { useLiveQuery } from '../lib/useLiveQuery'
import { useSettings } from '../lib/useSettings'
import { WeightDoseChart } from './ProgressCharts'

/**
 * A summary for a doctor's appointment (Tier 1 #5): the protocols with how
 * closely they were followed, weight with each dose marked, side effects
 * reported, and the dose log — for a chosen period. "Print or save as PDF"
 * hands it to the browser's print dialog, which saves a PDF or (on a phone)
 * shares it; nothing else is involved and nothing leaves the device unless
 * the person sends it.
 *
 * Rendered at the end of <body> so the print stylesheet (index.css) can print
 * only this; while printing, the page switches to the light theme so it comes
 * out as dark ink on white, then switches back.
 */
export function DoctorReport({ unit, onClose }: { unit: WeightUnit; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const settings = useSettings()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const weights = useLiveQuery(() => db.weights.toArray(), [])
  const checkIns = useLiveQuery(() => db.checkIns.toArray(), [])
  const [range, setRange] = useState<ChartRange>('90d')
  const [now] = useState(() => new Date())

  // Print in the light theme, whatever is on screen.
  useEffect(() => {
    const html = document.documentElement
    let previous: string | null = null
    const before = () => {
      previous = html.getAttribute('data-theme')
      html.setAttribute('data-theme', 'light')
    }
    const after = () => {
      if (previous) html.setAttribute('data-theme', previous)
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  const earliest = useMemo(() => {
    const times = [...(doseLogs ?? []).map((l) => l.administeredAt), ...(weights ?? []).map((w) => w.measuredAt)].sort()
    return times.length ? new Date(times[0]!) : null
  }, [doseLogs, weights])
  const from = useMemo(() => rangeStart(range, now, earliest), [range, now, earliest])
  const report = useMemo(
    () => buildReport(protocols ?? [], doseLogs ?? [], weights ?? [], checkIns ?? [], from, now),
    [protocols, doseLogs, weights, checkIns, from, now],
  )
  const focus = report.protocols[0]?.protocol ?? null
  const points = weightPoints(report.weights, focus, from, now)
  const steps = stepsShaded(points.map((p) => stepOn(focus, p.at)))
  const doseMarks = report.doses.filter((d) => d.status === 'taken').map((d) => new Date(d.administeredAt))
  const symptoms = symptomList(settings?.symptoms)
  const fmt = (grams: number) => `${formatDecimal(weightIn(grams, unit), locale, 1)} ${unit}`
  const doseText = (mcg: number | undefined, iu: number | undefined) =>
    iu !== undefined
      ? `${formatDecimal(iuFromMilliIU(iu as MilliIU), locale, 2)} IU`
      : mcg !== undefined
        ? mcg >= 1000
          ? `${formatDecimal(mcg / 1000, locale, 3)} mg`
          : `${formatDecimal(mcg, locale, 0)} mcg`
        : ''

  return createPortal(
    <div className="report-portal fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.back')}
          className="flex size-11 items-center justify-center rounded-full text-primary"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-foreground">{t('report.title')}</h1>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          {t('report.print')}
        </Button>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-10 pt-4">
        <div className="no-print flex flex-col gap-2">
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
          <p className="text-xs text-muted-foreground">{t('report.howTo')}</p>
        </div>

        <header className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{BRAND.appName}</p>
          <h2 className="font-display text-2xl font-bold text-foreground">{t('report.heading')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('report.period', { from: formatDate(report.from), to: formatDate(report.to) })} ·{' '}
            {t('report.generated', { date: formatDateTime(now) })}
          </p>
          <p className="text-xs text-muted-foreground">{t('report.disclaimer')}</p>
        </header>

        <Section title={t('report.protocols')}>
          {report.protocols.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('report.none')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t('report.protocol')}</th>
                  <th className="py-1 pr-2 font-medium">{t('report.doseSchedule')}</th>
                  <th className="py-1 font-medium">{t('report.adherence')}</th>
                </tr>
              </thead>
              <tbody>
                {report.protocols.map(({ protocol, adherence }) => (
                  <tr key={protocol.id} className="border-t border-border align-top">
                    <td className="py-2 pr-2 text-foreground">
                      <span className="font-semibold">{protocol.name || getCompoundById(protocol.compoundId)?.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {getCompoundById(protocol.compoundId)?.name} · {t(`route.${protocol.route}`)} ·{' '}
                        {t('report.since', { date: formatDate(new Date(`${protocol.startDate}T12:00:00`)) })}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      {formatDose(doseOn(protocol, now))} · {scheduleSummary(protocol.schedule, t)}
                      {protocol.titration && (
                        <span className="block text-xs text-muted-foreground">
                          {t('report.steps', {
                            steps: protocol.titration.steps
                              .map((s, i, all) =>
                                i === all.length - 1
                                  ? formatDose({ amount: s.doseAmount, unit: protocol.doseUnit })
                                  : `${formatDose({ amount: s.doseAmount, unit: protocol.doseUnit })} × ${s.weeks} ${t('charts.weeks').toLowerCase()}`,
                              )
                              .join(' → '),
                          })}
                        </span>
                      )}
                    </td>
                    <td className="py-2 tabular-nums">
                      {adherence.percent === null ? (
                        '—'
                      ) : (
                        <>
                          {adherence.percent}%
                          <span className="block text-xs text-muted-foreground">
                            {t('adherence.detail', { taken: adherence.taken, skipped: adherence.skipped, missed: adherence.missed })}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t('report.weight')}>
          {report.startGrams !== null && report.latestGrams !== null ? (
            <p className="text-sm text-foreground">
              {t('report.weightLine', {
                start: fmt(report.startGrams),
                latest: fmt(report.latestGrams),
                change: `${report.latestGrams - report.startGrams > 0 ? '+' : report.latestGrams === report.startGrams ? '' : '−'}${fmt(Math.abs(report.latestGrams - report.startGrams))}`,
              })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('report.noWeights')}</p>
          )}
          {points.length >= 2 && (
            <WeightDoseChart
              points={points}
              steps={steps}
              from={from}
              to={now}
              goalGrams={null}
              toUnit={(g) => weightIn(g, unit)}
              fmt={fmt}
              doseMarks={doseMarks}
            />
          )}
        </Section>

        <Section title={t('report.sideEffects')}>
          {report.symptoms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {report.checkInDays ? t('report.noSideEffects', { count: report.checkInDays }) : t('report.noCheckIns')}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t('report.symptom')}</th>
                  <th className="py-1 pr-2 font-medium">{t('report.daysReported', { count: report.checkInDays })}</th>
                  <th className="py-1 font-medium">{t('report.severity')}</th>
                </tr>
              </thead>
              <tbody>
                {report.symptoms.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-1.5 pr-2 text-foreground">
                      {symptomName(symptoms.find((x) => x.id === s.id) ?? { id: s.id, name: t('symptoms.removed') }, t)}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{s.days}</td>
                    <td className="py-1.5">
                      {t('report.severityLine', {
                        worst: t(`severity.${['', 'mild', 'moderate', 'severe'][s.worst]}`),
                        mean: s.mean,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t('report.doseLog')}>
          {report.doses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('report.none')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t('history.date')}</th>
                  <th className="py-1 pr-2 font-medium">{t('report.compound')}</th>
                  <th className="py-1 pr-2 font-medium">{t('charts.dose')}</th>
                  <th className="py-1 font-medium">{t('report.status')}</th>
                </tr>
              </thead>
              <tbody>
                {report.doses.map((d) => (
                  <tr key={d.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{formatDateTime(new Date(d.administeredAt))}</td>
                    <td className="py-1.5 pr-2">{getCompoundById(d.compoundId)?.name ?? t('history.unknownCompound')}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{doseText(d.doseMcg, d.doseIU)}</td>
                    <td className="py-1.5">
                      {t(`history.status.${d.status}`)}
                      {d.site && <span className="block text-xs text-muted-foreground">{t(`sites.${d.site}`)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report-section flex flex-col gap-3">
      <h3 className="border-b border-border pb-1 text-base font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}
