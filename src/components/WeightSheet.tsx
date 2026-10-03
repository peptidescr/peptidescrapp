import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DatePicker } from '@/components/DatePicker'
import { Button } from '@/components/ui/button'
import { NumericInput } from '@/components/ui/numeric-input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { toIsoDate } from '../lib/dates'
import { addWeight, gramsFrom, isPlausibleWeight, type WeightUnit } from '../lib/results'
import { parsePositiveAmount } from '../lib/sanitize'

/**
 * Logs a weight. Defaults to now; an earlier date can be picked, which is how
 * a weight from before the first dose (the baseline) gets in. Mounted only while open.
 */
export function WeightSheet({ unit, onClose }: { unit: WeightUnit; onClose: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [date, setDate] = useState(toIsoDate(new Date()))
  const [busy, setBusy] = useState(false)
  const parsed = parsePositiveAmount(value)
  const grams = parsed === null ? null : gramsFrom(parsed, unit)
  const valid = grams !== null && isPlausibleWeight(grams)
  const today = toIsoDate(new Date())

  async function handleSave() {
    if (!valid || grams === null) return
    setBusy(true)
    try {
      // Today: the actual moment. An earlier day: midday, so it can't slip across a date line.
      const at = date === today ? new Date() : new Date(`${date}T12:00:00`)
      await addWeight(grams, at)
      toast.success(t('progress.weightSaved'))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('progress.logWeight')}</SheetTitle>
          <SheetDescription>{t('progress.logWeightBody')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t('progress.weightLabel', { unit })}</span>
            <NumericInput
              kind="decimal"
              value={value}
              onValueChange={setValue}
              aria-invalid={value !== '' && !valid}
              autoFocus
            />
            {value !== '' && !valid && (
              <span role="alert" className="text-sm text-destructive">
                {t('progress.weightInvalid')}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t('history.date')}</span>
            <DatePicker value={date} onChange={(d) => setDate(d > today ? today : d)} />
          </label>
          <Button disabled={!valid || busy} onClick={() => void handleSave()}>
            {t('common.save')}
          </Button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}
