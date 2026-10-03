import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../lib/dates'
import {
  niceTicks,
  type DoseStep,
  type DoseStepResult,
  type SiteResult,
  type Timeline,
  type WeightPoint,
} from '../lib/progressCharts'
import { stepLabel, symptomName } from '../lib/resultsText'
import type { Symptom } from '../lib/results'

/*
 * The Progress charts, drawn as plain SVG in the brand's own tokens (see the
 * --chart-* variables in each brand's tokens.css, validated with the dataviz
 * skill's palette script). Every chart has a text equivalent: a legend, a
 * tooltip on hover/focus, and a table — nothing is colour-only.
 */

const DOSE_FILL = (shade: number) => (shade === 0 ? 'var(--brand-muted)' : `var(--chart-dose-${shade})`)
const SEV_FILL = (severity: number) => `var(--chart-sev-${severity})`

/**
 * The rendered width of an element, kept up to date. A callback ref, so it
 * attaches whenever the element appears — a chart that first renders its
 * empty state and only later its SVG still gets measured.
 */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    setWidth(el.clientWidth)
    observer.current = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.current.observe(el)
  }, [])
  return [ref, width]
}

function Legend({ items }: { items: { key: string; label: string; swatch: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          {item.swatch}
          {item.label}
        </li>
      ))}
    </ul>
  )
}

const Dot = ({ fill }: { fill: string }) => (
  <svg width="10" height="10" aria-hidden className="shrink-0">
    <circle cx="5" cy="5" r="4" fill={fill} />
  </svg>
)
const Swatch = ({ fill }: { fill: string }) => (
  <svg width="12" height="10" aria-hidden className="shrink-0">
    <rect width="12" height="10" rx="2" fill={fill} />
  </svg>
)

function TableToggle({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <details className="text-sm">
      <summary className="min-h-11 cursor-pointer py-3 text-primary">{t('charts.showTable')}</summary>
      <div className="overflow-x-auto">{children}</div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Weight, coloured by dose step
// ---------------------------------------------------------------------------

const PAD = { left: 40, right: 12, top: 12, bottom: 24 }
const HEIGHT = 200

export function WeightDoseChart({
  points,
  steps,
  from,
  to,
  goalGrams,
  toUnit,
  fmt,
}: {
  points: WeightPoint[]
  steps: DoseStep[]
  from: Date
  to: Date
  goalGrams: number | null
  /** Grams → the display unit's number. */
  toUnit: (grams: number) => number
  /** Grams → "92.4 kg". */
  fmt: (grams: number) => string
}) {
  const { t } = useTranslation()
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const shadeOf = useMemo(() => new Map(steps.map((s) => [s.key, s.shade])), [steps])
  const stepByKey = useMemo(() => new Map(steps.map((s) => [s.key, s])), [steps])
  const present = steps.filter((s) => points.some((p) => p.step === s.key))

  const values = points.map((p) => toUnit(p.grams))
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(hi - lo, 2)
  const yMin = lo - span * 0.15
  const yMax = hi + span * 0.15
  const ticks = niceTicks(yMin, yMax)
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const tSpan = Math.max(1, to.getTime() - from.getTime())
  const x = (d: Date) => PAD.left + ((d.getTime() - from.getTime()) / tSpan) * innerW
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH
  const goal = goalGrams === null ? null : toUnit(goalGrams)
  const goalVisible = goal !== null && goal >= yMin && goal <= yMax

  function nearest(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.at) - px) < Math.abs(x(points[best]!.at) - px)) best = i
    })
    setActive(best)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? points.length) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  if (points.length < 2) {
    return <p className="text-sm text-muted-foreground">{t('charts.needTwoWeights')}</p>
  }

  const activePoint = active === null ? null : points[active]
  return (
    <div className="flex flex-col gap-3">
      {present.length > 1 && (
        <Legend
          items={present.map((s) => ({ key: s.key, label: stepLabel(s, t), swatch: <Dot fill={DOSE_FILL(s.shade)} /> }))}
        />
      )}
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            tabIndex={0}
            aria-label={t('charts.weightAria', { from: fmt(points[0]!.grams), to: fmt(points.at(-1)!.grams) })}
            onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--brand-border)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {v}
                </text>
              </g>
            ))}
            {goalVisible && (
              <g>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(goal)} y2={y(goal)} stroke="var(--brand-ink)" strokeOpacity={0.5} strokeWidth={1} />
                <text x={width - PAD.right} y={y(goal) - 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                  {t('charts.goal')}
                </text>
              </g>
            )}
            <text x={PAD.left} y={HEIGHT - 6} className="fill-muted-foreground text-[11px]">
              {formatDate(from)}
            </text>
            <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {formatDate(to)}
            </text>

            {points.slice(1).map((p, i) => {
              const prev = points[i]!
              return (
                <line
                  key={`s${i}`}
                  x1={x(prev.at)}
                  y1={y(toUnit(prev.grams))}
                  x2={x(p.at)}
                  y2={y(toUnit(p.grams))}
                  stroke={DOSE_FILL(shadeOf.get(p.step) ?? 0)}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              )
            })}
            {activePoint && (
              <line
                x1={x(activePoint.at)}
                x2={x(activePoint.at)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--brand-muted)"
                strokeWidth={1}
              />
            )}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={x(p.at)}
                cy={y(toUnit(p.grams))}
                r={i === active ? 6 : 4}
                fill={DOSE_FILL(shadeOf.get(p.step) ?? 0)}
                stroke="var(--brand-surface)"
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
        {activePoint && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(x(activePoint.at) - 70, 0), Math.max(0, width - 140)),
              width: 140,
            }}
          >
            <p className="text-sm font-semibold text-foreground">{fmt(activePoint.grams)}</p>
            <p className="text-muted-foreground">{formatDate(activePoint.at)}</p>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <svg width="12" height="2" aria-hidden>
                <line x1="0" x2="12" y1="1" y2="1" stroke={DOSE_FILL(shadeOf.get(activePoint.step) ?? 0)} strokeWidth={2} />
              </svg>
              {stepLabel(stepByKey.get(activePoint.step) ?? { key: activePoint.step }, t)}
            </p>
          </div>
        )}
      </div>
      <TableToggle>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">{t('history.date')}</th>
              <th className="py-1 font-medium">{t('progress.weightTitle')}</th>
              <th className="py-1 font-medium">{t('charts.dose')}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5">{formatDate(p.at)}</td>
                <td className="py-1.5 tabular-nums">{fmt(p.grams)}</td>
                <td className="py-1.5">{stepLabel(stepByKey.get(p.step) ?? { key: p.step }, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results by dose step, and by injection site (tables — the numbers are the chart)
// ---------------------------------------------------------------------------

export function DoseStepTable({
  results,
  steps,
  fmtChange,
}: {
  results: DoseStepResult[]
  steps: DoseStep[]
  /** Grams → "−1.5 kg". */
  fmtChange: (grams: number) => string
}) {
  const { t } = useTranslation()
  const shadeOf = new Map(steps.map((s) => [s.key, s.shade]))
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-1 pr-2 font-medium">{t('charts.dose')}</th>
          <th className="py-1 pr-2 font-medium">{t('charts.weeks')}</th>
          <th className="py-1 pr-2 font-medium">{t('charts.weightChange')}</th>
          <th className="py-1 font-medium">{t('charts.sideEffectDays')}</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.key} className="border-t border-border align-top">
            <td className="py-2 pr-2">
              <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-foreground">
                <Dot fill={DOSE_FILL(shadeOf.get(r.key) ?? 1)} />
                {stepLabel(r, t)}
              </span>
            </td>
            <td className="py-2 pr-2 tabular-nums">{Math.round((r.days / 7) * 10) / 10}</td>
            <td className="py-2 pr-2 tabular-nums">
              {r.weightChangeGrams === null ? (
                '—'
              ) : (
                <>
                  {fmtChange(r.weightChangeGrams)}
                  {r.perWeekGrams !== null && (
                    <span className="block text-xs text-muted-foreground">
                      {t('charts.perWeek', { change: fmtChange(r.perWeekGrams) })}
                    </span>
                  )}
                </>
              )}
            </td>
            <td className="py-2 tabular-nums">
              {r.checkInDays === 0 ? (
                '—'
              ) : (
                <>
                  {t('charts.ofCheckIns', { days: r.sideEffectDays, total: r.checkInDays })}
                  {r.meanSeverity !== null && (
                    <span className="block text-xs text-muted-foreground">
                      {t('charts.meanSeverity', { value: r.meanSeverity })}
                    </span>
                  )}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SiteTable({ results }: { results: SiteResult[] }) {
  const { t } = useTranslation()
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-1 pr-2 font-medium">{t('history.site')}</th>
          <th className="py-1 pr-2 font-medium">{t('charts.doses')}</th>
          <th className="py-1 font-medium">{t('charts.siteReactions')}</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.site} className="border-t border-border align-top">
            <td className="py-2 pr-2 text-foreground">{t(`sites.${r.site}`)}</td>
            <td className="py-2 pr-2 tabular-nums">{r.doses}</td>
            <td className="py-2 tabular-nums">
              {r.reactionDoses === 0 ? (
                t('charts.none')
              ) : (
                <>
                  {t('charts.ofDoses', { count: r.reactionDoses, total: r.doses })}
                  {r.meanSeverity !== null && (
                    <span className="block text-xs text-muted-foreground">
                      {t('charts.meanSeverity', { value: r.meanSeverity })}
                    </span>
                  )}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Side effects on the dose timeline
// ---------------------------------------------------------------------------

const LABEL_W = 92
const ROW_H = 18
const ROW_GAP = 6
const MAX_ROWS = 8

export function SideEffectTimelineChart({
  timeline,
  steps,
  symptoms,
}: {
  timeline: Timeline
  steps: DoseStep[]
  symptoms: Symptom[]
}) {
  const { t } = useTranslation()
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const shadeOf = new Map(steps.map((s) => [s.key, s.shade]))
  const nameOf = (id: string) => symptomName(symptoms.find((s) => s.id === id) ?? { id, name: t('symptoms.removed') }, t)
  const rows = timeline.symptoms.slice(0, MAX_ROWS)
  const cols = timeline.columns
  const cellW = Math.max(0, (width - LABEL_W) / Math.max(1, cols.length))
  const gap = cellW >= 6 ? 2 : cellW >= 3 ? 1 : 0
  const height = (rows.length + 1) * (ROW_H + ROW_GAP) + 18
  const rowY = (i: number) => i * (ROW_H + ROW_GAP)
  const columnLabel = (c: Timeline['columns'][number]) =>
    timeline.bin === 'day' ? formatDate(c.from) : t('charts.weekOf', { date: formatDate(c.from) })

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') setActive((i) => Math.min(cols.length - 1, (i ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? cols.length) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  // A range change can leave a stale index behind; it just shows nothing.
  const activeCol = active === null ? null : (cols[active] ?? null)
  const sevLabels = [t('severity.mild'), t('severity.moderate'), t('severity.severe')]
  return (
    <div className="flex flex-col gap-3">
      <Legend
        items={[
          ...sevLabels.map((label, i) => ({ key: `sev${i}`, label, swatch: <Swatch fill={SEV_FILL(i + 1)} /> })),
          { key: 'dose', label: t('charts.doseTaken'), swatch: <Dot fill={DOSE_FILL(steps.find((s) => s.shade > 0)?.shade ?? 2)} /> },
        ]}
      />
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            tabIndex={0}
            aria-label={t('charts.timelineAria')}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[t('charts.doses'), ...rows.map(nameOf)].map((label, i) => (
              <text key={i} x={0} y={rowY(i) + ROW_H / 2} dy="0.32em" className="fill-muted-foreground text-[11px]">
                {label.length > 13 ? `${label.slice(0, 12)}…` : label}
              </text>
            ))}
            {cols.map((c, ci) => {
              const cx = LABEL_W + ci * cellW
              return (
                <g key={ci}>
                  {c.doses > 0 && (
                    <circle
                      cx={cx + cellW / 2}
                      cy={rowY(0) + ROW_H / 2}
                      r={Math.max(3, Math.min(5, cellW / 2 - gap))}
                      fill={DOSE_FILL(c.doseStep ? (shadeOf.get(c.doseStep) ?? 0) : 2)}
                    />
                  )}
                  {rows.map((id, ri) => {
                    const severity = c.severity[id]
                    return (
                      <rect
                        key={id}
                        x={cx + gap / 2}
                        y={rowY(ri + 1)}
                        width={Math.max(1, cellW - gap)}
                        height={ROW_H}
                        rx={Math.min(3, cellW / 3)}
                        fill={severity ? SEV_FILL(severity) : 'var(--brand-border)'}
                        fillOpacity={severity ? 1 : 0.35}
                      />
                    )
                  })}
                  {/* The whole column is the hit target (taller and wider than any cell). */}
                  <rect
                    x={cx}
                    y={0}
                    width={cellW}
                    height={rowY(rows.length + 1)}
                    fill="transparent"
                    onPointerEnter={() => setActive(ci)}
                    onPointerDown={() => setActive(ci)}
                  />
                  {ci === active && (
                    <rect
                      x={cx}
                      y={0}
                      width={cellW}
                      height={rowY(rows.length + 1) - ROW_GAP}
                      fill="none"
                      stroke="var(--brand-ink)"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      rx={2}
                      pointerEvents="none"
                    />
                  )}
                </g>
              )
            })}
            <text x={LABEL_W} y={height - 4} className="fill-muted-foreground text-[11px]">
              {cols[0] ? formatDate(cols[0].from) : ''}
            </text>
            <text x={width} y={height - 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {cols.at(-1) ? formatDate(cols.at(-1)!.to) : ''}
            </text>
          </svg>
        )}
        {activeCol && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md"
            style={{
              top: height - 8,
              left: Math.min(Math.max(LABEL_W + (active ?? 0) * cellW - 80, 0), Math.max(0, width - 180)),
              width: 180,
            }}
          >
            <p className="font-semibold text-foreground">{columnLabel(activeCol)}</p>
            <p className="text-muted-foreground">
              {activeCol.doses > 0 ? t('charts.dosesTaken', { count: activeCol.doses }) : t('charts.noDose')}
            </p>
            {Object.entries(activeCol.severity).length === 0 ? (
              <p className="text-muted-foreground">{t('charts.noSideEffects')}</p>
            ) : (
              Object.entries(activeCol.severity).map(([id, severity]) => (
                <p key={id} className="flex items-center gap-1.5 text-foreground">
                  <Swatch fill={SEV_FILL(severity)} />
                  {nameOf(id)} · {sevLabels[severity - 1]}
                </p>
              ))
            )}
          </div>
        )}
      </div>
      {timeline.symptoms.length > MAX_ROWS && (
        <p className="text-xs text-muted-foreground">{t('charts.moreSymptoms', { count: timeline.symptoms.length - MAX_ROWS })}</p>
      )}
      <TableToggle>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">{timeline.bin === 'day' ? t('history.date') : t('charts.week')}</th>
              <th className="py-1 pr-2 font-medium">{t('charts.doses')}</th>
              <th className="py-1 font-medium">{t('progress.sideEffects')}</th>
            </tr>
          </thead>
          <tbody>
            {[...cols]
              .reverse()
              .filter((c) => c.doses > 0 || Object.keys(c.severity).length > 0)
              .map((c, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="py-1.5 pr-2">{columnLabel(c)}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{c.doses}</td>
                  <td className="py-1.5">
                    {Object.entries(c.severity)
                      .map(([id, s]) => `${nameOf(id)} (${sevLabels[s - 1]})`)
                      .join(', ') || '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  )
}
