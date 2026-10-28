import { AlertTriangle, Check, CircleHelp, FlaskConical, Info, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChipGroup } from '@/components/ui/chip-group'
import { Combobox } from '@/components/ui/combobox'
import { NumericInput } from '@/components/ui/numeric-input'
import { Segmented } from '@/components/ui/segmented'
import { StatTile } from '@/components/ui/stat-tile'
import { BacWaterCard } from '../components/BacWaterCard'
import { CustomCompoundSheet } from '../components/CustomCompoundSheet'
import { SyringeGraphic } from '../components/SyringeGraphic'
import { VialSheet, type VialPrefill } from '../components/VialSheet'
import { compareAlphabetical, getCompoundById, vialSizeUnit, type Compound } from '../content/compounds'
import { DILUENT_PRESETS_ML, DOSE_PRESETS_MCG, vialChipValues } from '../lib/calculatorPresets'
import { toCompoundOptions, useSelectableCompounds } from '../lib/customCompounds'
import { db, type Protocol, type SavedReconstitution } from '../lib/db'
import {
  mixFromSolutionIU,
  mixFromSolutionMass,
  mixFromVialIU,
  mixFromVialMass,
  type MixResult,
} from '../lib/reconstitution'
import { layoutSyringe } from '../lib/syringe'
import {
  formatDecimal,
  formatGrouped,
  formatSyringeUnits,
  formatVolumeMlFixed,
  microgramsFromMass,
  microlitersFromMl,
  milliIUFromIU,
  parseDecimal,
  syringeUnitsPerMl,
  syringeCapacityUnits,
  syringeSizeFor,
  DEFAULT_SYRINGE_SIZE_ML,
  SYRINGE_SIZES_BY_TYPE,
  type SyringeSizeMl,
  type Locale,
  type MassUnit,
  type SyringeType,
} from '../lib/units'
import { doseOn } from '../lib/titration'
import { readLegacySyringeType } from '../lib/syringeLegacy'
import { useLiveQuery } from '../lib/useLiveQuery'
import { updateSettings, useSettings } from '../lib/useSettings'
import { activeVialFor } from '../lib/vials'

const SYRINGE_TYPES: SyringeType[] = ['U-100', 'U-50', 'U-40']

type Custom = 'custom'

/** What the calculator hands to "save to protocol" — everything in a saved mix except when it was saved. */
type MixSnapshot = Omit<SavedReconstitution, 'savedAt'>

interface CalculatorScreenProps {
  /**
   * A protocol this session is mixing for — set when arriving from the
   * "reconstitute next" offer after saving one. Prefills the compound, dose
   * and any previously saved mix, and preselects it as the save target.
   */
  protocolId?: string
  /** "Create a protocol" from the save section, for a compound with no active protocol yet. */
  onCreateProtocol: (compoundId: string) => void
  /** Called once a mix has been saved to a protocol. Lets the host move on (the new-protocol flow ends back at Home). */
  onSavedToProtocol?: () => void
}

/**
 * The reconstitution calculator, as the approved screen lays it out: a result
 * panel ("Draw to 10 units" over the syringe and two stat tiles) above preset
 * rows for the vial, the diluent and the target aliquot. Every row also has
 * "Custom", which opens the free numeric input, so nothing the older form
 * accepted is out of reach.
 *
 * Nothing is preselected except the compound's first vial size, as before: a
 * preset is a shortcut for typing a number, not a suggested dilution or dose.
 * The compound picker, IU compounds, blends, ready-made solutions, the syringe
 * type and barrel, saving to a protocol and starting a vial from the mix all
 * work as they did.
 */
export function CalculatorScreen({ protocolId, onCreateProtocol, onSavedToProtocol }: CalculatorScreenProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const settings = useSettings()

  const selectable = useSelectableCompounds()
  const compoundOptions = useMemo(() => toCompoundOptions(selectable, t), [selectable, t])
  const [addingCompound, setAddingCompound] = useState(false)

  const [compoundId, setCompoundId] = useState(selectable[0]?.id ?? '')
  const compound = selectable.find((c) => c.id === compoundId) ?? selectable[0]

  const [vialSize, setVialSize] = useState<number>(compound?.vialSizes[0] ?? 0)
  const [diluentMl, setDiluentMl] = useState('')
  const [concentrationInput, setConcentrationInput] = useState('')
  const [doseInput, setDoseInput] = useState('')
  const [doseUnit, setDoseUnit] = useState<MassUnit>('mg')
  const [syringeType, setSyringeType] = useState<SyringeType>('U-100')
  // The barrel, as a size in mL (SYRINGE_SIZES_BY_TYPE); 1 mL unless the person picked another.
  const [syringeSizeMl, setSyringeSizeMl] = useState<SyringeSizeMl>(DEFAULT_SYRINGE_SIZE_ML)
  // Start on the syringe last used. This screen's own settings query is empty on
  // its first render, so the saved choice is picked up once, when it arrives (the
  // same set-state-during-render shape as the protocol prefill below). A row from
  // the few days 3 mL was a type of its own reads as a 3 mL U-100 until the
  // migration (migrations.ts) has rewritten it.
  const [syringeRestored, setSyringeRestored] = useState(false)
  if (settings && !syringeRestored) {
    const saved = readLegacySyringeType(settings.syringeType)
    const type = (saved.type as SyringeType | undefined) ?? 'U-100'
    setSyringeRestored(true)
    setSyringeType(type)
    setSyringeSizeMl(syringeSizeFor(type, settings.syringeSizeMl ?? saved.sizeMl ?? DEFAULT_SYRINGE_SIZE_ML))
  }
  // Whether each row is in "Custom" mode (its own numeric input open) rather than on a preset.
  const [customVial, setCustomVial] = useState(false)
  const [vialInput, setVialInput] = useState('')
  const [customDiluent, setCustomDiluent] = useState(false)
  const [customDose, setCustomDose] = useState(false)
  const [showExplainer, setShowExplainer] = useState(true)
  const [showBacHelp, setShowBacHelp] = useState(false)
  const [saveTargetId, setSaveTargetId] = useState<string | null>(protocolId ?? null)

  // Arriving from a protocol: fill in what the protocol already knows so the
  // only thing left to enter is how much diluent went in. Same
  // set-state-during-render shape as ProtocolForm's load of an existing
  // protocol — runs once, when the live query first resolves. A value that is
  // not one of the presets opens its row in Custom mode so it can be seen.
  const linked = useLiveQuery(() => (protocolId ? db.protocols.get(protocolId) : undefined), [protocolId])
  const [prefilled, setPrefilled] = useState(!protocolId)
  if (linked && !prefilled) {
    const linkedCompound = selectable.find((c) => c.id === linked.compoundId)
    setCompoundId(linked.compoundId)
    const size = linked.reconstitution?.vialSize ?? linkedCompound?.vialSizes[0] ?? 0
    setVialSize(size)
    if (linkedCompound && !vialChipValues(vialSizeUnit(linkedCompound), linkedCompound.vialSizes).includes(size)) {
      setCustomVial(true)
      setVialInput(formatDecimal(size, locale, 4))
    }
    // Today's dose: for a titration, the step in force now, not the first one.
    const dose = doseOn(linked, new Date())
    setDoseInput(String(dose.amount).replace('.', ','))
    if (dose.unit !== 'IU') {
      setDoseUnit(dose.unit)
      if (!(dose.unit === 'mcg' && (DOSE_PRESETS_MCG as readonly number[]).includes(dose.amount))) setCustomDose(true)
    }
    if (linked.reconstitution?.diluentMl !== undefined) {
      setDiluentMl(String(linked.reconstitution.diluentMl).replace('.', ','))
      if (!(DILUENT_PRESETS_ML as readonly number[]).includes(linked.reconstitution.diluentMl)) setCustomDiluent(true)
    }
    setPrefilled(true)
  }

  function handleReset() {
    setCompoundId(selectable[0]?.id ?? '')
    setVialSize(selectable[0]?.vialSizes[0] ?? 0)
    setCustomVial(false)
    setVialInput('')
    setDiluentMl('')
    setCustomDiluent(false)
    setConcentrationInput('')
    setDoseInput('')
    setCustomDose(false)
    setSaveTargetId(null)
  }

  function handleSelectCompound(id: string) {
    setCompoundId(id)
    setSaveTargetId(null)
    setCustomVial(false)
    // The live registry, not `selectable`: a compound created a moment ago
    // (Add your own) isn't in this render's list yet.
    const next = getCompoundById(id)
    if (next) {
      setVialSize(next.vialSizes[0] ?? 0)
      setDoseUnit(next.defaultUnit === 'mcg' ? 'mcg' : 'mg')
    }
  }

  function handleSyringeChange(type: SyringeType) {
    // A 0.3 mL barrel only exists for U-100, so moving off it falls back to the usual 1 mL.
    const size = syringeSizeFor(type, syringeSizeMl)
    setSyringeType(type)
    setSyringeSizeMl(size)
    void updateSettings({ syringeType: type, syringeSizeMl: size })
  }

  function handleSizeChange(size: SyringeSizeMl) {
    setSyringeSizeMl(size)
    void updateSettings({ syringeSizeMl: size })
  }

  function pickVial(choice: number | Custom) {
    if (choice === 'custom') {
      setCustomVial(true)
      setVialInput(vialSize > 0 ? formatDecimal(vialSize, locale, 4) : '')
    } else {
      setCustomVial(false)
      setVialSize(choice)
    }
  }

  function typeVial(text: string) {
    setVialInput(text)
    const parsed = parseDecimal(text)
    setVialSize(parsed !== null && parsed > 0 ? parsed : 0)
  }

  function pickDiluent(choice: number | Custom) {
    if (choice === 'custom') {
      setCustomDiluent(true)
    } else {
      setCustomDiluent(false)
      setDiluentMl(formatDecimal(choice, locale, 4))
    }
  }

  function pickDose(choice: number | Custom) {
    if (choice === 'custom') {
      setCustomDose(true)
    } else {
      setCustomDose(false)
      // A ready-made solution's concentration is entered in the same mg or mcg as
      // the dose, so a preset keeps the unit in use rather than flipping it
      // under a number already typed. A powder reads out in mcg, as the preset is.
      if (isSolution && doseUnit === 'mg') {
        setDoseInput(formatDecimal(choice / 1000, locale, 4))
      } else {
        setDoseUnit('mcg')
        setDoseInput(formatDecimal(choice, locale, 4))
      }
    }
  }

  const isSolution = compound?.form === 'solution'
  const isIU = compound?.defaultUnit === 'IU'

  const diluentValue = parseDecimal(diluentMl)
  const concentrationValue = parseDecimal(concentrationInput)
  const doseValue = parseDecimal(doseInput)

  let result: MixResult | null = null
  let error: string | null = null

  // Guarded by `compound` rather than relying on the early return below,
  // because that return happens AFTER this — and after the hook further
  // down, which must run on every render (Rules of Hooks) regardless of
  // whether a compound is resolved yet. A vial size of 0 is a Custom amount
  // still being typed: no result yet, and no error either.
  if (compound && vialSize > 0) {
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
  }

  // Home's get-started checklist marks "try the calculator" done from this
  // flag, because using a calculator otherwise leaves no trace anywhere else
  // in the data (see the doc comment on Settings.hasUsedCalculator) — this is
  // the one place that has to actually set it. `hasResult` rather than
  // `result` itself in the dependency array: `result` is a fresh object every
  // render, which would fire this on every keystroke instead of once on the
  // null→non-null transition. Guarded so it's a single write per install, not
  // a write on every render once already true.
  const hasResult = result !== null
  useEffect(() => {
    if (hasResult && !settings?.hasUsedCalculator) {
      void updateSettings({ hasUsedCalculator: true })
    }
  }, [hasResult, settings?.hasUsedCalculator])

  if (!compound) {
    return null
  }

  const unit = vialSizeUnit(compound)

  const snapshot: MixSnapshot | null =
    result && doseValue !== null
      ? {
          vialSize,
          vialUnit: unit,
          diluentMl: isSolution ? undefined : (diluentValue ?? undefined),
          syringeType,
          syringeSizeMl,
          drawVolumeMl: result.drawVolumeMl,
          drawSyringeUnits: result.drawSyringeUnits,
          doseAmount: doseValue,
          doseUnit: isIU ? 'IU' : doseUnit,
        }
      : null

  // What a vial started from this mix holds: the vial's own amount for a
  // powder, or concentration × bottle volume for a ready-made solution.
  const vialPrefill: VialPrefill | undefined = !result
    ? undefined
    : isSolution
      ? concentrationValue !== null
        ? { amount: Math.round(concentrationValue * vialSize * 1000) / 1000, amountUnit: isIU ? 'IU' : doseUnit }
        : undefined
      : {
          amount: vialSize,
          amountUnit: isIU ? 'IU' : compound.defaultUnit === 'mcg' ? 'mcg' : 'mg',
          diluentMl: diluentValue ?? undefined,
        }

  // The preset rows: what is selected, and what to show beside each label.
  const vialChips = vialChipValues(unit, compound.vialSizes)
  const vialSelected: number | Custom | null = customVial ? 'custom' : vialSize
  const diluentSelected: number | Custom | null = customDiluent
    ? 'custom'
    : diluentValue !== null && (DILUENT_PRESETS_ML as readonly number[]).includes(diluentValue)
      ? diluentValue
      : null
  // The dose in micrograms, whichever unit it is entered in, to find the preset it equals.
  const doseMcg = doseValue === null ? null : Math.round(doseValue * (doseUnit === 'mg' ? 1000 : 1) * 1000) / 1000
  const doseSelected: number | Custom | null = customDose
    ? 'custom'
    : doseMcg !== null && (DOSE_PRESETS_MCG as readonly number[]).includes(doseMcg)
      ? doseMcg
      : null
  const customOption = { value: 'custom' as Custom, label: t('calculator.custom') }
  const dash = '–'

  // The syringe: the type, and the barrel chosen (1 mL unless picked). A draw too big for it
  // is drawn on the next barrel up (layoutSyringe).
  const chosenBarrel = syringeCapacityUnits(syringeType, syringeSizeMl)
  const barrelMl = (capacity: number) => {
    const ml = capacity / syringeUnitsPerMl(syringeType)
    return Number.isInteger(ml) ? String(ml) : formatDecimal(ml, locale, 2)
  }
  const drawnBarrel = result ? layoutSyringe(syringeType, result.drawSyringeUnits, chosenBarrel).capacityUnits : chosenBarrel

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('calculator.title')}</h1>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t('calculator.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="-mr-2 flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-muted-foreground active:bg-secondary"
        >
          <RotateCcw className="size-4" />
          {t('calculator.resetForm')}
        </button>
      </header>

      {linked && (
        <p className="flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-foreground">
          <FlaskConical className="size-4 shrink-0 text-primary" />
          {t('calculator.forProtocol', { name: linked.name || compound.name })}
        </p>
      )}

      {showExplainer && (
        <div className="flex items-start gap-3 rounded-2xl bg-accent px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="flex-1 text-foreground">
            {isSolution ? t('calculator.explainerSolution') : t('calculator.explainerPowder')}
          </p>
          <button
            type="button"
            onClick={() => setShowExplainer(false)}
            aria-label={t('common.cancel')}
            className="-mr-2 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <PresetRow label={t('calculator.compound')}>
        <Combobox
          value={compoundId}
          onValueChange={handleSelectCompound}
          options={compoundOptions}
          emptyText={t('common.noMatches')}
          aria-label={t('calculator.compound')}
          footerAction={{ label: t('compounds.addCustom'), onSelect: () => setAddingCompound(true) }}
        />
        <CustomCompoundSheet
          open={addingCompound}
          onOpenChange={setAddingCompound}
          onSaved={(saved) => handleSelectCompound(saved.id)}
        />
      </PresetRow>

      {/* The payoff of the whole screen, so it gets the brand surface and the one number you act on is set large. */}
      <section aria-live="polite" className="rounded-[1.375rem] bg-hero p-4 text-on-primary">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-light">{t('calculator.drawTo')}</h2>
        {error && (
          <p className="mt-3 flex items-start gap-2 text-sm text-on-primary">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        {!error && !result && <p className="mt-3 text-sm text-on-primary-muted">{t('calculator.awaitingInput')}</p>}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key={`${result.drawVolumeUl}-${result.concentrationPerMl}-${chosenBarrel}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-1 flex flex-col gap-4"
            >
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[3.25rem] font-bold leading-none tabular-nums">
                    {formatSyringeUnits(result.drawSyringeUnits, locale)}
                  </span>
                  <span className="text-base font-medium text-on-primary-muted">{t('calculator.unitsWord')}</span>
                </p>
                <p className="mt-1.5 text-[13px] text-on-primary-muted">
                  {t('calculator.onSyringe', {
                    volume: `${formatVolumeMlFixed(result.drawVolumeUl, locale)} mL`,
                    units: drawnBarrel,
                    ml: barrelMl(drawnBarrel),
                  })}
                </p>
              </div>
              <SyringeGraphic
                drawUnits={result.drawSyringeUnits}
                syringeType={syringeType}
                minCapacityUnits={chosenBarrel}
                tone="hero"
              />
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label={t('calculator.concentrationResult')}
                  value={
                    isIU ? (
                      <WithUnit amount={formatGrouped(result.concentrationPerMl / 1000, locale, 2)} unit="IU/mL" />
                    ) : doseUnit === 'mcg' ? (
                      <WithUnit amount={formatGrouped(result.concentrationPerMl, locale, 0)} unit="mcg/mL" />
                    ) : (
                      <WithUnit amount={formatGrouped(result.concentrationPerMl / 1000, locale, 3)} unit="mg/mL" />
                    )
                  }
                />
                <StatTile label={t('calculator.aliquotsPerVial')} value={String(result.dosesRemaining)} />
              </div>
              {result.lowVolumeWarning && (
                <p className="flex items-start gap-2 rounded-xl bg-on-primary-tile px-3 py-2 text-sm text-on-primary">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t('calculator.lowVolumeWarning')}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <PresetRow
        label={isSolution ? t('calculator.bottleVolumeLabel') : isIU ? t('calculator.vialAmount') : t('calculator.vialMass')}
        current={vialSize > 0 ? `${formatDecimal(vialSize, locale, 4)} ${unit}` : dash}
      >
        <ChipGroup
          ariaLabel={isSolution ? t('calculator.bottleVolumeLabel') : t('calculator.vialMass')}
          value={vialSelected}
          onChange={pickVial}
          options={[...vialChips.map((v) => ({ value: v as number | Custom, label: String(v), ariaLabel: `${v} ${unit}` })), customOption]}
        />
        {customVial && (
          <NumberInput value={vialInput} onChange={typeVial} suffix={unit} ariaLabel={t('calculator.custom')} />
        )}
      </PresetRow>

      {isSolution ? (
        <PresetRow label={t('calculator.concentration', { unit: isIU ? 'IU/mL' : `${doseUnit}/mL` })}>
          <div className="flex items-center gap-2">
            <NumberInput value={concentrationInput} onChange={setConcentrationInput} />
            {!isIU && <UnitToggle unit={doseUnit} onChange={setDoseUnit} />}
          </div>
        </PresetRow>
      ) : (
        <PresetRow
          label={t('calculator.diluentVolume')}
          current={diluentValue !== null && diluentValue > 0 ? `${formatDecimal(diluentValue, locale, 4)} mL` : dash}
          help={
            <button
              type="button"
              onClick={() => setShowBacHelp((open) => !open)}
              aria-expanded={showBacHelp}
              aria-label={t('calculator.bacWaterHelpLabel')}
              className="-my-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            >
              <CircleHelp className="size-[18px]" />
            </button>
          }
        >
          {showBacHelp && <p className="text-sm text-muted-foreground">{t('calculator.bacWaterHelp')}</p>}
          <ChipGroup
            ariaLabel={t('calculator.diluentVolume')}
            value={diluentSelected}
            onChange={pickDiluent}
            perRow={DILUENT_PRESETS_ML.length}
            options={[
              ...DILUENT_PRESETS_ML.map((v) => ({ value: v as number | Custom, label: String(v), ariaLabel: `${v} mL` })),
              customOption,
            ]}
          />
          {customDiluent && (
            <NumberInput value={diluentMl} onChange={setDiluentMl} suffix="mL" ariaLabel={t('calculator.bacWaterToAdd')} />
          )}
        </PresetRow>
      )}

      <PresetRow
        label={t('calculator.targetAliquot')}
        current={doseValue !== null ? `${formatDecimal(doseValue, locale, 4)} ${isIU ? 'IU' : doseUnit}` : dash}
      >
        {isIU ? (
          // No generic presets for IU: what an IU amount means differs per product.
          <NumberInput value={doseInput} onChange={setDoseInput} suffix="IU" ariaLabel={t('calculator.targetAliquot')} />
        ) : (
          <>
            <ChipGroup
              ariaLabel={t('calculator.targetAliquot')}
              value={doseSelected}
              onChange={pickDose}
              perRow={DOSE_PRESETS_MCG.length}
              options={[
                ...DOSE_PRESETS_MCG.map((v) => ({ value: v as number | Custom, label: String(v), ariaLabel: `${v} mcg` })),
                customOption,
              ]}
            />
            {customDose && (
              <div className="flex items-center gap-2">
                <NumberInput value={doseInput} onChange={setDoseInput} ariaLabel={t('calculator.targetAliquot')} />
                <UnitToggle unit={doseUnit} onChange={setDoseUnit} />
              </div>
            )}
          </>
        )}
      </PresetRow>

      <PresetRow label={t('calculator.syringeType')}>
        <Segmented
          ariaLabel={t('calculator.syringeType')}
          value={syringeType}
          onChange={handleSyringeChange}
          options={SYRINGE_TYPES.map((type) => ({ value: type, label: type }))}
        />
      </PresetRow>
      <PresetRow label={t('calculator.syringeSize')}>
        <Segmented
          ariaLabel={t('calculator.syringeSize')}
          value={String(syringeSizeMl)}
          onChange={(value) => handleSizeChange(Number(value) as SyringeSizeMl)}
          // Largest first, like the 3 mL / 1 mL / 0.5 mL / 0.3 mL they are sold as.
          options={[...SYRINGE_SIZES_BY_TYPE[syringeType]].reverse().map((size) => ({
            value: String(size),
            label: `${formatDecimal(size, locale, 1)} mL`,
          }))}
        />
      </PresetRow>

      <BacWaterCard />

      {snapshot && (
        <SaveToProtocol
          compound={compound}
          snapshot={snapshot}
          vialPrefill={vialPrefill}
          targetId={saveTargetId}
          onTargetChange={setSaveTargetId}
          onCreateProtocol={() => onCreateProtocol(compound.id)}
          onSaved={onSavedToProtocol}
        />
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t('calculator.disclaimer')}</p>
    </div>
  )
}

/**
 * Attaches the current result to one of the user's active protocols for this
 * compound. Only protocols for the same compound are offered: a draw volume is
 * meaningless against a different compound's protocol. With nothing to attach
 * to, the way forward (create one) is offered rather than a dead end.
 */
function SaveToProtocol({
  compound,
  snapshot,
  vialPrefill,
  targetId,
  onTargetChange,
  onCreateProtocol,
  onSaved,
}: {
  compound: Compound
  snapshot: MixSnapshot
  vialPrefill?: VialPrefill
  targetId: string | null
  onTargetChange: (id: string) => void
  onCreateProtocol: () => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const vials = useLiveQuery(() => db.vials.toArray(), [])
  const [busy, setBusy] = useState(false)
  const [startingVial, setStartingVial] = useState(false)

  const candidates = useMemo(
    () =>
      (protocols ?? [])
        .filter((p) => p.isActive && p.compoundId === compound.id)
        .sort((a, b) => compareAlphabetical(a.name || compound.name, b.name || compound.name)),
    [protocols, compound],
  )

  if (protocols === undefined) return null

  // Fall back to the only candidate so a single matching protocol is one tap.
  const target: Protocol | undefined =
    candidates.find((p) => p.id === targetId) ?? (candidates.length === 1 ? candidates[0] : undefined)
  const saved = target?.reconstitution
  const isCurrent =
    saved !== undefined &&
    saved.vialSize === snapshot.vialSize &&
    saved.diluentMl === snapshot.diluentMl &&
    saved.syringeType === snapshot.syringeType &&
    (saved.syringeSizeMl ?? DEFAULT_SYRINGE_SIZE_ML) === (snapshot.syringeSizeMl ?? DEFAULT_SYRINGE_SIZE_ML) &&
    saved.drawSyringeUnits === snapshot.drawSyringeUnits &&
    saved.doseAmount === snapshot.doseAmount &&
    saved.doseUnit === snapshot.doseUnit

  async function handleSave() {
    if (!target) return
    setBusy(true)
    try {
      await db.protocols.update(target.id, { reconstitution: { ...snapshot, savedAt: new Date().toISOString() } })
      toast.success(t('calculator.saved', { name: target.name || compound.name }))
      onSaved?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('calculator.saveTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {candidates.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">{t('calculator.noActiveProtocol', { compound: compound.name })}</p>
            <Button variant="secondary" onClick={onCreateProtocol}>
              {t('calculator.createProtocolCta')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('calculator.saveBody')}</p>
            {candidates.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={target?.id === p.id}
                    onClick={() => onTargetChange(p.id)}
                    className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                      target?.id === p.id
                        ? 'border-primary bg-accent text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {p.name || compound.name}
                  </button>
                ))}
              </div>
            )}
            <Button onClick={() => void handleSave()} disabled={!target || busy || isCurrent}>
              {isCurrent ? (
                <>
                  <Check className="size-4" />
                  {t('calculator.alreadySaved')}
                </>
              ) : saved ? (
                t('calculator.updateCta')
              ) : (
                t('calculator.saveCta')
              )}
            </Button>
            {target && vialPrefill && (
              <>
                <Button variant="secondary" onClick={() => setStartingVial(true)}>
                  {t('vials.startFromMix')}
                </Button>
                <VialSheet
                  open={startingVial}
                  onOpenChange={setStartingVial}
                  compoundId={compound.id}
                  protocolId={target.id}
                  prefill={vialPrefill}
                  replacesActive={activeVialFor(target.id, vials ?? []) !== undefined}
                />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One row of the form: a label with the value chosen so far on the right (and
 * an optional help button), then the control. A group, not a <label>, because
 * the controls inside are several buttons and inputs.
 */
function PresetRow({
  label,
  current,
  help,
  children,
}: {
  label: string
  current?: string
  help?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <span className="flex min-w-0 items-center gap-1 font-display text-sm font-semibold text-foreground">
          {label}
          {help}
        </span>
        {current && <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{current}</span>}
      </div>
      {children}
    </div>
  )
}

/** A number with its unit set smaller beside it, so "2,500 mcg/mL" fits a half-width tile on a narrow phone. */
function WithUnit({ amount, unit }: { amount: string; unit: string }) {
  return (
    <>
      {amount} <span className="text-xs font-semibold">{unit}</span>
    </>
  )
}

function NumberInput({
  value,
  onChange,
  suffix,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  suffix?: string
  ariaLabel?: string
}) {
  return (
    <div className="relative flex-1">
      <NumericInput
        kind="decimal"
        value={value}
        onValueChange={onChange}
        placeholder="0"
        aria-label={ariaLabel}
        // Selected on focus, so typing replaces the value a preset left there. The
        // mouse-up is swallowed because it would drop the caret and undo the selection.
        onFocus={(e) => {
          const field = e.target
          requestAnimationFrame(() => field.select())
        }}
        onMouseUp={(e) => e.preventDefault()}
        className={`min-h-12 text-base ${suffix ? 'pr-14' : ''}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-base text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

function UnitToggle({ unit, onChange }: { unit: MassUnit; onChange: (u: MassUnit) => void }) {
  return (
    <Segmented
      ariaLabel="mg / mcg"
      className="w-36 shrink-0"
      value={unit}
      onChange={onChange}
      options={[
        { value: 'mg', label: 'mg' },
        { value: 'mcg', label: 'mcg' },
      ]}
    />
  )
}
