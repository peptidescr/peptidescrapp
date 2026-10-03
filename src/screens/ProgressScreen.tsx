import { FileText, HeartPulse, Plus, Scale, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { AppHeader } from '../components/AppHeader'
import { CheckInSheet } from '../components/CheckInSheet'
import { DoctorReport } from '../components/DoctorReport'
import { ProgressTrends } from '../components/ProgressTrends'
import { ResultsSettingsSheet } from '../components/ResultsSettingsSheet'
import { WeightSheet } from '../components/WeightSheet'
import { formatDate } from '../lib/dates'
import { db } from '../lib/db'
import {
  baselineWeights,
  deleteWeight,
  symptomList,
  todayKey,
  weightIn,
  weightProgress,
  weightUnitOf,
  type WeightUnit,
} from '../lib/results'
import { checkInSummary } from '../lib/resultsText'
import { formatDecimal, type Locale } from '../lib/units'
import { useLiveQuery } from '../lib/useLiveQuery'
import { useSettings } from '../lib/useSettings'

const NBSP = String.fromCharCode(0xa0)

/**
 * Results tracking (Tier 1): weight against a starting point and a goal, and a
 * short daily check-in — side effects with severity, energy, mood, sleep,
 * food noise, optional measurements and a note. The charts that connect these
 * to doses build on the same data.
 */
export function ProgressScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const settings = useSettings()
  const unit = weightUnitOf(settings)
  const weights = useLiveQuery(() => db.weights.orderBy('measuredAt').toArray(), [])
  const checkIns = useLiveQuery(() => db.checkIns.orderBy('date').reverse().limit(14).toArray(), [])
  const firstDose = useLiveQuery(() => db.doseLogs.where('status').equals('taken').sortBy('administeredAt'), [])
  const [sheet, setSheet] = useState<'weight' | 'settings' | { checkIn: string } | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const symptoms = useMemo(() => symptomList(settings?.symptoms), [settings?.symptoms])
  const progress = useMemo(() => weightProgress(weights ?? [], settings?.goalWeightGrams), [weights, settings?.goalWeightGrams])
  const firstDoseAt = firstDose?.[0]?.administeredAt
  // Before any dose at all, every weight is from before the first dose.
  const startIsBaseline = progress.start !== null && baselineWeights([progress.start], firstDoseAt).length === 1
  const today = todayKey()
  const todayCheckIn = checkIns?.find((c) => c.date === today)
  const fmt = (grams: number) => `${formatDecimal(weightIn(grams, unit), locale, 1)}${NBSP}${unit}`

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-2">
      <AppHeader
        title={t('nav.progress')}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setReportOpen(true)}>
              <FileText className="size-4" />
              {t('report.open')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSheet('settings')} aria-label={t('progress.settingsTitle')}>
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
        }
      />

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Scale className="size-4" />
          {t('progress.weightTitle')}
        </div>
        {progress.latest ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="font-display text-3xl font-bold text-foreground">{fmt(progress.latest.grams)}</p>
              {progress.changeGrams !== null && progress.changeGrams !== 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('progress.sinceStart', {
                    change: `${progress.changeGrams > 0 ? '+' : '−'}${fmt(Math.abs(progress.changeGrams))}`,
                    pct: formatDecimal(Math.abs(progress.changePct ?? 0), locale, 1),
                  })}
                </p>
              )}
            </div>
            {progress.start && (
              <p className="text-xs text-muted-foreground">
                {t(startIsBaseline ? 'progress.startBaseline' : 'progress.start', {
                  weight: fmt(progress.start.grams),
                  date: formatDate(new Date(progress.start.measuredAt)),
                })}
              </p>
            )}
            {progress.goalGrams !== null && progress.toGoal !== null && (
              <div className="flex flex-col gap-1.5">
                <Progress value={Math.max(0, Math.min(1, progress.toGoal)) * 100} label={t('progress.goalProgressLabel')} />
                <p className="text-xs text-muted-foreground">
                  {t('progress.goalLine', {
                    goal: fmt(progress.goalGrams),
                    pct: Math.round(Math.max(0, progress.toGoal) * 100),
                  })}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('progress.noWeight')}</p>
        )}
        <Button onClick={() => setSheet('weight')}>
          <Plus className="size-4" />
          {t('progress.logWeight')}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <HeartPulse className="size-4" />
          {t('progress.todayTitle')}
        </div>
        {todayCheckIn ? (
          <p className="text-sm text-foreground">{checkInSummary(todayCheckIn, symptoms, t)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('progress.noCheckIn')}</p>
        )}
        <Button variant={todayCheckIn ? 'secondary' : 'primary'} onClick={() => setSheet({ checkIn: today })}>
          {todayCheckIn ? t('progress.editCheckIn') : t('progress.checkIn')}
        </Button>
      </Card>

      <ProgressTrends unit={unit} goalGrams={progress.goalGrams} symptoms={symptoms} fmt={fmt} />

      {(checkIns ?? []).some((c) => c.date !== today) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('progress.recentCheckIns')}</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {(checkIns ?? [])
              .filter((c) => c.date !== today)
              .slice(0, 7)
              .map((c) => (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => setSheet({ checkIn: c.date })}
                  className="flex min-h-12 w-full flex-col items-start gap-0.5 px-4 py-2 text-left"
                >
                  <span className="text-sm font-semibold text-foreground">{formatDate(new Date(`${c.date}T12:00:00`))}</span>
                  <span className="text-xs text-muted-foreground">{checkInSummary(c, symptoms, t)}</span>
                </button>
              ))}
          </Card>
        </section>
      )}

      {(weights ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('progress.recentWeights')}</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {[...(weights ?? [])]
              .reverse()
              .slice(0, 5)
              .map((w) => (
                <div key={w.id} className="flex min-h-12 items-center justify-between gap-3 py-1 pl-4 pr-1 text-sm">
                  <span className="text-foreground">{fmt(w.grams)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatDate(new Date(w.measuredAt))}</span>
                  <button
                    type="button"
                    aria-label={t('progress.deleteWeight', { weight: fmt(w.grams) })}
                    onClick={() => void deleteWeight(w.id)}
                    className="flex size-11 items-center justify-center text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
          </Card>
        </section>
      )}

      {reportOpen && <DoctorReport unit={unit} onClose={() => setReportOpen(false)} />}
      {sheet === 'weight' && <WeightSheet unit={unit} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <ResultsSettingsSheet settings={settings} onClose={() => setSheet(null)} />}
      {sheet !== null && typeof sheet === 'object' && (
        <CheckInSheet
          date={sheet.checkIn}
          existing={checkIns?.find((c) => c.date === sheet.checkIn)}
          symptoms={symptoms}
          unit={unit as WeightUnit}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
