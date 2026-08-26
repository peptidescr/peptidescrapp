import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
        <select
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base"
          value={compoundId}
          onChange={(e) => handleSelectCompound(e.target.value)}
        >
          {[...grouped.entries()].map(([category, compounds]) => (
            <optgroup key={category} label={category}>
              {compounds.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
                    className="min-h-11 rounded-full border border-brand-border px-3 text-sm text-brand-muted active:bg-brand-surface-2"
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
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium ${
                syringeType === type
                  ? 'border-brand-primary bg-brand-primary-lt text-brand-primary'
                  : 'border-brand-border text-brand-muted'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </Field>

      <div className="rounded-2xl border border-brand-border bg-brand-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-muted">
          {t('calculator.resultTitle')}
        </h2>
        {error && <p className="text-sm text-brand-warn">{error}</p>}
        {!error && !result && <p className="text-sm text-brand-muted">{t('calculator.awaitingInput')}</p>}
        {result && (
          <div className="flex flex-col gap-3">
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
              <p className="rounded-xl bg-brand-warn-lt px-3 py-2 text-sm text-brand-warn">
                {t('calculator.lowVolumeWarning')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-brand-ink">{label}</span>
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
        className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3 text-base"
        placeholder="0"
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-brand-muted">
          {suffix}
        </span>
      )}
    </div>
  )
}

function UnitToggle({ unit, onChange }: { unit: MassUnit; onChange: (u: MassUnit) => void }) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-brand-border">
      {(['mg', 'mcg'] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`min-h-11 px-3 text-sm font-medium ${
            unit === u ? 'bg-brand-primary text-white' : 'bg-brand-surface text-brand-muted'
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
          className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
            value === opt
              ? 'border-brand-primary bg-brand-primary-lt text-brand-primary'
              : 'border-brand-border text-brand-muted'
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
      <span className="text-sm text-brand-muted">{label}</span>
      <span className={emphasis ? 'text-lg font-semibold text-brand-primary' : 'text-base text-brand-ink'}>
        {value}
      </span>
    </div>
  )
}
