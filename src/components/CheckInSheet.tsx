import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NumericInput } from '@/components/ui/numeric-input'
import { Segmented } from '@/components/ui/segmented'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { formatDate } from '../lib/dates'
import {
  CHECK_IN_SCALES,
  lengthIn,
  lengthUnitFor,
  mmFrom,
  saveCheckIn,
  type CheckIn,
  type CheckInScale,
  type Rating,
  type Severity,
  type Symptom,
  type WeightUnit,
} from '../lib/results'
import { symptomName } from '../lib/resultsText'
import { MAX_NOTES_LENGTH, parsePositiveAmount, sanitizeMultiline } from '../lib/sanitize'

const RATINGS: Rating[] = [1, 2, 3, 4, 5]
type SeverityChoice = '0' | '1' | '2' | '3'

/**
 * One day's check-in: four quick 1–5 scales, side effects with severity, and
 * optional measurements and a note. Everything is optional — only what's
 * answered is stored (see cleanCheckIn). Mounted only while open.
 */
export function CheckInSheet({
  date,
  existing,
  symptoms,
  unit,
  onClose,
}: {
  date: string
  existing: CheckIn | undefined
  symptoms: Symptom[]
  unit: WeightUnit
  onClose: () => void
}) {
  const { t } = useTranslation()
  const lengthUnit = lengthUnitFor(unit)
  const [scales, setScales] = useState<Partial<Record<CheckInScale, Rating>>>(() =>
    Object.fromEntries(CHECK_IN_SCALES.flatMap((s) => (existing?.[s] ? [[s, existing[s]]] : []))),
  )
  const [sideEffects, setSideEffects] = useState<Record<string, Severity>>(existing?.sideEffects ?? {})
  const [waist, setWaist] = useState(existing?.waistMm ? String(lengthIn(existing.waistMm, lengthUnit)) : '')
  const [bodyFat, setBodyFat] = useState(existing?.bodyFatPct ? String(existing.bodyFatPct) : '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [showMeasures, setShowMeasures] = useState(Boolean(existing?.waistMm || existing?.bodyFatPct))
  const [busy, setBusy] = useState(false)

  // Side effects recorded on this day for a symptom since removed from the list still show, so they can be cleared.
  const listed = [
    ...symptoms,
    ...Object.keys(sideEffects)
      .filter((id) => !symptoms.some((s) => s.id === id))
      .map((id) => ({ id, name: t('symptoms.removed') })),
  ]

  function toggleScale(scale: CheckInScale, value: Rating) {
    setScales((s) => {
      const next = { ...s }
      if (next[scale] === value) delete next[scale]
      else next[scale] = value
      return next
    })
  }

  function setSeverity(id: string, choice: SeverityChoice) {
    setSideEffects((s) => {
      const next = { ...s }
      if (choice === '0') delete next[id]
      else next[id] = Number(choice) as Severity
      return next
    })
  }

  async function handleSave() {
    setBusy(true)
    try {
      const waistValue = parsePositiveAmount(waist)
      const fatValue = parsePositiveAmount(bodyFat)
      await saveCheckIn({
        date,
        ...scales,
        sideEffects,
        waistMm: waistValue === null ? undefined : mmFrom(waistValue, lengthUnit),
        bodyFatPct: fatValue ?? undefined,
        note,
      })
      toast.success(t('progress.checkInSaved'))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('progress.checkInTitle')}</SheetTitle>
          <SheetDescription>{t('progress.checkInBody', { date: formatDate(new Date(`${date}T12:00:00`)) })}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {CHECK_IN_SCALES.map((scale) => (
            <fieldset key={scale} className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-foreground">{t(`checkIn.${scale}.label`)}</legend>
              <div className="flex gap-1.5" role="group" aria-label={t(`checkIn.${scale}.label`)}>
                {RATINGS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scales[scale] === value}
                    aria-label={`${value} — ${t(`checkIn.${scale}.label`)}`}
                    onClick={() => toggleScale(scale, value)}
                    className={cn(
                      'min-h-11 flex-1 rounded-full border text-sm font-semibold transition-colors',
                      scales[scale] === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t(`checkIn.${scale}.low`)}</span>
                <span>{t(`checkIn.${scale}.high`)}</span>
              </div>
            </fieldset>
          ))}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.sideEffects')}</h3>
            {listed.map((symptom) => (
              <div key={symptom.id} className="flex flex-col gap-1.5">
                <span className="text-sm text-foreground">{symptomName(symptom, t)}</span>
                <Segmented<SeverityChoice>
                  ariaLabel={symptomName(symptom, t)}
                  value={String(sideEffects[symptom.id] ?? 0) as SeverityChoice}
                  onChange={(choice) => setSeverity(symptom.id, choice)}
                  options={[
                    { value: '0', label: t('severity.none') },
                    { value: '1', label: t('severity.mild') },
                    { value: '2', label: t('severity.moderate') },
                    { value: '3', label: t('severity.severe') },
                  ]}
                  className="[&>button]:px-1 [&>button]:text-xs"
                />
              </div>
            ))}
          </section>

          {showMeasures ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">{t('progress.measurements')}</h3>
              <div className="flex items-end gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('progress.waist', { unit: lengthUnit })}</span>
                  <NumericInput kind="decimal" value={waist} onValueChange={setWaist} />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{t('progress.bodyFat')}</span>
                  <NumericInput kind="decimal" value={bodyFat} onValueChange={setBodyFat} />
                </label>
              </div>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setShowMeasures(true)}
              className="min-h-11 self-start text-sm text-primary"
            >
              {t('progress.addMeasurements')}
            </button>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">{t('progress.note')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(sanitizeMultiline(e.target.value))}
              maxLength={MAX_NOTES_LENGTH}
              rows={3}
              className="w-full rounded-2xl border border-input bg-card px-4 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <Button disabled={busy} onClick={() => void handleSave()}>
            {t('common.save')}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
