import { AlertTriangle, FlaskConical } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  listDiluents,
  listSelectableCompounds,
  vialSizeUnit,
  type Compound,
} from '../content/compounds'
import {
  mixFromSolutionIU,
  mixFromSolutionMass,
  mixFromVialIU,
  mixFromVialMass,
  type MixResult,
} from '../lib/reconstitution'
import {
  formatDecimal,
  formatSyringeUnits,
  formatVolumeMl,
  microgramsFromMass,
  microlitersFromMl,
  milliIUFromIU,
  parseDecimal,
  type Locale,
  type MassUnit,
  type SyringeType,
} from '../lib/units'
import { updateSettings, useSettings } from '../lib/useSettings'

const SYRINGE_TYPES: SyringeType[] = ['U-100', 'U-50', 'U-40']

function groupByCategory(compounds: Compound[]): Map<string, Compound[]> {
  const map = new Map<string, Compound[]>()
  for (const c of compounds) {
    const list = map.get(c.category) ?? []
    list.push(c)
    map.set(c.category, list)
  }
  return map
}

export function CalculatorScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const settings = useSettings()

  const selectable = useMemo(() => listSelectableCompounds(), [])
  const diluents = useMemo(() => listDiluents(), [])
  const grouped = useMemo(() => groupByCategory(selectable), [selectable])

  const [compoundId, setCompoundId] = useState(selectable[0]?.id ?? '')
  const compound = selectable.find((c) => c.id === compoundId) ?? selectable[0]

  const [vialSize, setVialSize] = useState<number>(compound?.vialSizes[0] ?? 0)
  const [diluentMl, setDiluentMl] = useState('')
  const [concentrationInput, setConcentrationInput] = useState('')
  const [doseInput, setDoseInput] = useState('')
  const [doseUnit, setDoseUnit] = useState<MassUnit>('mg')
  const [syringeType, setSyringeType] = useState<SyringeType>(settings?.syringeType ?? 'U-100')

  function handleSelectCompound(id: string) {
    setCompoundId(id)
    const next = selectable.find((c) => c.id === id)
    if (next) {
      setVialSize(next.vialSizes[0] ?? 0)
      setDoseUnit(next.defaultUnit === 'mcg' ? 'mcg' : 'mg')
    }
  }

  function handleSyringeChange(type: SyringeType) {
    setSyringeType(type)
    void updateSettings({ syringeType: type })
  }

  if (!compound) {
    return null
  }

  const isSolution = compound.form === 'solution'
  const isIU = compound.defaultUnit === 'IU'
  const unit = vialSizeUnit(compound)

  const diluentValue = parseDecimal(diluentMl)
  const concentrationValue = parseDecimal(concentrationInput)
  const doseValue = parseDecimal(doseInput)

  let result: MixResult | null = null
  let error: string | null = null

  try {
    if (isSolution) {
      if (concentrationValue !== null && doseValue !== null) {
        const totalVolumeUl = microlitersFromMl(vialSize)
        result = isIU
          ? mixFromSolutionIU({
              concentrationMilliIUPerMl: concentrationValue * 1000,
              totalVolumeUl,
              desiredDoseMilliIU: milliIUFromIU(doseValue),
              syringeType,
            })
          : mixFromSolutionMass({
              concentrationMcgPerMl: microgramsFromMass(concentrationValue, doseUnit),
              totalVolumeUl,
              desiredDoseMcg: microgramsFromMass(doseValue, doseUnit),
              syringeType,
            })
      }
    } else if (diluentValue !== null && diluentValue > 0 && doseValue !== null) {
      const diluentVolumeUl = microlitersFromMl(diluentValue)
      result = isIU
        ? mixFromVialIU({
            vialAmountMilliIU: milliIUFromIU(vialSize),
            diluentVolumeUl,
            desiredDoseMilliIU: milliIUFromIU(doseValue),
            syringeType,
          })
        : mixFromVialMass({
            vialAmountMcg: microgramsFromMass(vialSize, compound.defaultUnit === 'mcg' ? 'mcg' : 'mg'),
            diluentVolumeUl,
            desiredDoseMcg: microgramsFromMass(doseValue, doseUnit),
            syringeType,
          })
    }
  } catch {
    error = t('calculator.invalidInput')
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-4">
      <h1 className="text-xl font-semibold">{t('calculator.title')}</h1>

      <Field label={t('calculator.compound')}>
        <Select value={compoundId} onValueChange={handleSelectCompound}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...grouped.entries()].map(([category, compounds]) => (
              <SelectGroup key={category}>
                <SelectLabel>{category}</SelectLabel>
                {compounds.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {isSolution ? (
        <>
          <Field label={t('calculator.bottleVolume', { unit: 'mL' })}>
            <ChipSelect
              options={compound.vialSizes}
              value={vialSize}
              onChange={setVialSize}
              suffix="mL"
            />
          </Field>
          <Field label={t('calculator.concentration', { unit: isIU ? 'IU/mL' : `${doseUnit}/mL` })}>
            <div className="flex gap-2">
              <NumberInput value={concentrationInput} onChange={setConcentrationInput} />
              {!isIU && <UnitToggle unit={doseUnit} onChange={setDoseUnit} />}
            </div>
          </Field>
        </>
      ) : (
        <>
          <Field label={t('calculator.vialSize', { unit })}>
            <ChipSelect options={compound.vialSizes} value={vialSize} onChange={setVialSize} suffix={unit} />
          </Field>
          <Field label={t('calculator.diluentVolume')}>
            <NumberInput value={diluentMl} onChange={setDiluentMl} suffix="mL" />
            <div className="mt-2 flex flex-wrap gap-2">
              {diluents.flatMap((d) =>
                d.vialSizes.map((size) => (
                  <button
                    key={`${d.id}-${size}`}
                    type="button"
                    onClick={() => setDiluentMl(String(size).replace('.', ','))}
                    className="min-h-11 rounded-full border border-border px-3 text-sm text-muted-foreground active:bg-accent"
                  >
                    {d.name} {size}mL
                  </button>
                )),
              )}
            </div>
          </Field>
        </>
      )}

      <Field label={t('calculator.desiredDose', { unit: isIU ? 'IU' : doseUnit })}>
        <div className="flex gap-2">
          <NumberInput value={doseInput} onChange={setDoseInput} />
          {!isIU && <UnitToggle unit={doseUnit} onChange={setDoseUnit} />}
        </div>
      </Field>

      <Field label={t('calculator.syringeType')}>
        <div className="flex gap-2">
          {SYRINGE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleSyringeChange(type)}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium transition-colors ${
                syringeType === type
                  ? 'border-primary bg-accent text-primary'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </Field>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-4" />
            {t('calculator.resultTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !result && <p className="text-sm text-muted-foreground">{t('calculator.awaitingInput')}</p>}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={`${result.drawVolumeUl}-${result.concentrationPerMl}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-3"
              >
                <ResultRow
                  label={t('calculator.concentrationResult')}
                  value={
                    isIU
                      ? `${formatDecimal(result.concentrationPerMl / 1000, locale, 2)} IU/mL`
                      : `${formatDecimal(
                          doseUnit === 'mcg' ? result.concentrationPerMl : result.concentrationPerMl / 1000,
                          locale,
                          doseUnit === 'mcg' ? 0 : 3,
                        )} ${doseUnit}/mL`
                  }
                />
                <ResultRow
                  label={t('calculator.drawVolume')}
                  value={`${formatVolumeMl(result.drawVolumeUl, locale)} mL`}
                  emphasis
                />
                <ResultRow
                  label={t('calculator.drawSyringeUnits', { syringeType })}
                  value={formatSyringeUnits(result.drawSyringeUnits, locale)}
                  emphasis
                />
                <ResultRow label={t('calculator.dosesRemaining')} value={String(result.dosesRemaining)} />
                {result.lowVolumeWarning && (
                  <p className="flex items-start gap-2 rounded-xl bg-brand-warn-lt px-3 py-2 text-sm text-brand-warn">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {t('calculator.lowVolumeWarning')}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function NumberInput({
  value,
  onChange,
  suffix,
}: {
  value: string
  onChange: (v: string) => void
  suffix?: string
}) {
  return (
    <div className="relative flex-1">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="0"
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

function UnitToggle({ unit, onChange }: { unit: MassUnit; onChange: (u: MassUnit) => void }) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-border">
      {(['mg', 'mcg'] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`min-h-11 px-3 text-sm font-medium transition-colors ${
            unit === u ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
          }`}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

function ChipSelect({
  options,
  value,
  onChange,
  suffix,
}: {
  options: number[]
  value: number
  onChange: (v: number) => void
  suffix: string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors ${
            value === opt ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
          }`}
        >
          {opt} {suffix}
        </button>
      ))}
    </div>
  )
}

function ResultRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={emphasis ? 'text-lg font-semibold text-primary' : 'text-base text-foreground'}>
        {value}
      </span>
    </div>
  )
}
