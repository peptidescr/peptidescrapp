import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Segmented } from '@/components/ui/segmented'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import type { Settings } from '../lib/db'
import {
  addCustomSymptom,
  BUILT_IN_SYMPTOMS,
  gramsFrom,
  isPlausibleWeight,
  MAX_CUSTOM_SYMPTOMS,
  updateSymptomPrefs,
  weightIn,
  weightUnitOf,
  type WeightUnit,
} from '../lib/results'
import { MAX_NAME_LENGTH, parsePositiveAmount, sanitizeText } from '../lib/sanitize'
import { updateSettings } from '../lib/useSettings'

/** Goal weight, the weight unit, and which symptoms the check-in asks about. Mounted only while open. */
export function ResultsSettingsSheet({ settings, onClose }: { settings: Settings | undefined; onClose: () => void }) {
  const { t } = useTranslation()
  const unit = weightUnitOf(settings)
  const [goal, setGoal] = useState(settings?.goalWeightGrams ? String(weightIn(settings.goalWeightGrams, unit)) : '')
  const [newSymptom, setNewSymptom] = useState('')
  const prefs = settings?.symptoms ?? { hidden: [], custom: [] }

  const goalValue = parsePositiveAmount(goal)
  const goalGrams = goalValue === null ? null : gramsFrom(goalValue, unit)
  const goalValid = goal === '' || (goalGrams !== null && isPlausibleWeight(goalGrams))

  async function changeUnit(next: WeightUnit) {
    // Keep the typed goal meaning the same weight in the new unit.
    if (goalGrams !== null) setGoal(String(weightIn(goalGrams, next)))
    await updateSettings({ weightUnit: next })
  }

  async function saveGoal() {
    if (!goalValid) return
    await updateSettings({ goalWeightGrams: goal === '' ? undefined : (goalGrams ?? undefined) })
    toast.success(t('progress.goalSaved'))
  }

  async function addSymptom() {
    await addCustomSymptom(settings?.symptoms, newSymptom)
    setNewSymptom('')
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('progress.settingsTitle')}</SheetTitle>
          <SheetDescription>{t('progress.settingsBody')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.unit')}</h3>
            <Segmented<WeightUnit>
              value={unit}
              onChange={(u) => void changeUnit(u)}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.goalLabel', { unit })}</h3>
            <div className="flex gap-2">
              <NumericInput kind="decimal" value={goal} onValueChange={setGoal} aria-invalid={!goalValid} className="flex-1" />
              <Button variant="secondary" disabled={!goalValid} onClick={() => void saveGoal()}>
                {t('common.save')}
              </Button>
            </div>
            {!goalValid && (
              <span role="alert" className="text-sm text-destructive">
                {t('progress.weightInvalid')}
              </span>
            )}
            <p className="text-xs text-muted-foreground">{t('progress.goalHint')}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t('progress.symptomsTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('progress.symptomsHint')}</p>
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
              {BUILT_IN_SYMPTOMS.map((id) => {
                const shown = !prefs.hidden.includes(id)
                return (
                  <li key={id}>
                    <label className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm text-foreground">
                      {t(`symptoms.${id}`)}
                      <Switch
                        checked={shown}
                        onCheckedChange={(on) =>
                          void updateSymptomPrefs({
                            ...prefs,
                            hidden: on ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id],
                          })
                        }
                      />
                    </label>
                  </li>
                )
              })}
              {prefs.custom.map((symptom) => (
                <li key={symptom.id} className="flex min-h-11 items-center justify-between gap-3 py-1 pl-4 pr-1 text-sm text-foreground">
                  {symptom.name}
                  <button
                    type="button"
                    aria-label={t('progress.removeSymptom', { name: symptom.name })}
                    onClick={() =>
                      void updateSymptomPrefs({ ...prefs, custom: prefs.custom.filter((c) => c.id !== symptom.id) })
                    }
                    className="flex size-11 items-center justify-center text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            {prefs.custom.length < MAX_CUSTOM_SYMPTOMS && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newSymptom.trim()) void addSymptom()
                }}
              >
                <Input
                  value={newSymptom}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder={t('progress.addSymptomPlaceholder')}
                  onChange={(e) => setNewSymptom(sanitizeText(e.target.value))}
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" disabled={!newSymptom.trim()} aria-label={t('progress.addSymptom')}>
                  <Plus className="size-4" />
                </Button>
              </form>
            )}
          </section>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
