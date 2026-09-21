import { AlertTriangle, Check, CircleHelp, FlaskConical, Info, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { NumericInput } from '@/components/ui/numeric-input'
import { Segmented } from '@/components/ui/segmented'
import { AppHeader } from '../components/AppHeader'
import {
  compareAlphabetical,
  listDiluents,
  listSelectableCompounds,
  vialSizeUnit,
  type Compound,
} from '../content/compounds'
import { db, type Protocol, type SavedReconstitution } from '../lib/db'
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
import { useLiveQuery } from '../lib/useLiveQuery'
import { updateSettings, useSettings } from '../lib/useSettings'

const SYRINGE_TYPES: SyringeType[] = ['U-100', 'U-50', 'U-40']

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
}

export function CalculatorScreen({ protocolId, onCreateProtocol }: CalculatorScreenProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const settings = useSettings()

  const selectable = useMemo(() => listSelectableCompounds(), [])
  const diluents = useMemo(() => listDiluents(), [])
  const compoundOptions = useMemo(
    () => selectable.map((c) => ({ value: c.id, label: c.name, hint: c.category })),
    [selectable],
  )

  const [compoundId, setCompoundId] = useState(selectable[0]?.id ?? '')
  const compound = selectable.find((c) => c.id === compoundId) ?? selectable[0]

  const [vialSize, setVialSize] = useState<number>(compound?.vialSizes[0] ?? 0)
  const [diluentMl, setDiluentMl] = useState('')
  const [concentrationInput, setConcentrationInput] = useState('')
  const [doseInput, setDoseInput] = useState('')
  const [doseUnit, setDoseUnit] = useState<MassUnit>('mg')
  const [syringeType, setSyringeType] = useState<SyringeType>(settings?.syringeType ?? 'U-100')
  const [showExplainer, setShowExplainer] = useState(true)
  const [showBacHelp, setShowBacHelp] = useState(false)
  const [saveTargetId, setSaveTargetId] = useState<string | null>(protocolId ?? null)

  // Arriving from a protocol: fill in what the protocol already knows so the
  // only thing left to enter is how much diluent went in. Same
  // set-state-during-render shape as ProtocolForm's load of an existing
  // protocol — runs once, when the live query first resolves.
  const linked = useLiveQuery(() => (protocolId ? db.protocols.get(protocolId) : undefined), [protocolId])
  const [prefilled, setPrefilled] = useState(!protocolId)
  if (linked && !prefilled) {
    const linkedCompound = selectable.find((c) => c.id === linked.compoundId)
    setCompoundId(linked.compoundId)
    setVialSize(linked.reconstitution?.vialSize ?? linkedCompound?.vialSizes[0] ?? 0)
    setDoseInput(String(linked.doseAmount).replace('.', ','))
    if (linked.doseUnit !== 'IU') setDoseUnit(linked.doseUnit)
    if (linked.reconstitution?.diluentMl !== undefined) {
      setDiluentMl(String(linked.reconstitution.diluentMl).replace('.', ','))
    }
    setPrefilled(true)
  }

  function handleReset() {
    setCompoundId(selectable[0]?.id ?? '')
    setVialSize(selectable[0]?.vialSizes[0] ?? 0)
    setDiluentMl('')
    setConcentrationInput('')
    setDoseInput('')
    setSaveTargetId(null)
  }

  function handleSelectCompound(id: string) {
    setCompoundId(id)
    setSaveTargetId(null)
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
  // whether a compound is resolved yet.
  if (compound) {
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
          drawVolumeMl: result.drawVolumeMl,
          drawSyringeUnits: result.drawSyringeUnits,
          doseAmount: doseValue,
          doseUnit: isIU ? 'IU' : doseUnit,
        }
      : null

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-2">
      <AppHeader
        title={t('calculator.title')}
        action={
          <button
            type="button"
            onClick={handleReset}
            className="flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground"
          >
            <RotateCcw className="size-4" />
            {t('calculator.resetForm')}
          </button>
        }
      />

      {linked && (
        <p className="-mt-2 flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-foreground">
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

      <Step number={1} title={t('calculator.step1')}>
        <Field label={t('calculator.compound')}>
          <Combobox
            value={compoundId}
            onValueChange={handleSelectCompound}
            options={compoundOptions}
            emptyText={t('common.noMatches')}
          />
        </Field>

        {isSolution ? (
          <Field label={t('calculator.bottleVolume', { unit: 'mL' })}>
            <ChipSelect options={compound.vialSizes} value={vialSize} onChange={setVialSize} suffix="mL" />
          </Field>
        ) : (
          <Field label={t('calculator.vialSize', { unit })}>
            <ChipSelect options={compound.vialSizes} value={vialSize} onChange={setVialSize} suffix={unit} />
          </Field>
        )}
      </Step>

      {isSolution ? (
        <Step number={2} title={t('calculator.step2Solution')}>
          <Field label={t('calculator.concentration', { unit: isIU ? 'IU/mL' : `${doseUnit}/mL` })}>
            <div className="flex items-center gap-2">
              <NumberInput value={concentrationInput} onChange={setConcentrationInput} />
              {!isIU && <UnitToggle unit={doseUnit} onChange={setDoseUnit} />}
            </div>
          </Field>
        </Step>
      ) : (
        <Step number={2} title={t('calculator.step2Powder')}>
          <div className="flex flex-col gap-2">
            {/* Tapping the help icon opens a one-line definition of BAC water,
                for anyone who hasn't met the term before. */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{t('calculator.bacWaterToAdd')}</span>
              <button
                type="button"
                onClick={() => setShowBacHelp((open) => !open)}
                aria-expanded={showBacHelp}
                aria-label={t('calculator.bacWaterHelpLabel')}
                className="-my-2 -mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground"
              >
                <CircleHelp className="size-[18px]" />
              </button>
            </div>
            {showBacHelp && <p className="text-sm text-muted-foreground">{t('calculator.bacWaterHelp')}</p>}
            <NumberInput
              value={diluentMl}
              onChange={setDiluentMl}
              suffix="mL"
              ariaLabel={t('calculator.bacWaterToAdd')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('calculator.quickFill')}</span>
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
        </Step>
      )}

      <Step number={3} title={t('calculator.step3')}>
        <Field label={t('calculator.desiredDose', { unit: isIU ? 'IU' : doseUnit })}>
          <div className="flex items-center gap-2">
            <NumberInput value={doseInput} onChange={setDoseInput} />
            {!isIU && <UnitToggle unit={doseUnit} onChange={setDoseUnit} />}
          </div>
        </Field>

        <Field label={t('calculator.syringeType')}>
          <Segmented
            ariaLabel={t('calculator.syringeType')}
            value={syringeType}
            onChange={handleSyringeChange}
            options={SYRINGE_TYPES.map((type) => ({ value: type, label: type }))}
          />
        </Field>
      </Step>

      {/* The payoff of the whole screen, so it gets the same brand surface as
          Home's hero and the two numbers you actually act on are set large. */}
      <section
        aria-live="polite"
        className="rounded-3xl p-5 text-white ring-1 ring-white/10"
        style={{ background: 'var(--brand-hero)' }}
      >
        <h2 className="flex items-center gap-2 text-sm font-medium text-white/75">
          <FlaskConical className="size-4" />
          {t('calculator.resultTitle')}
        </h2>
        {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
        {!error && !result && <p className="mt-3 text-sm text-white/70">{t('calculator.awaitingInput')}</p>}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key={`${result.drawVolumeUl}-${result.concentrationPerMl}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-4 flex flex-col gap-5"
            >
              {/* items-end: when one label wraps (narrow phone, Spanish) the two
                  numbers still share a baseline instead of stepping. */}
              <div className="grid grid-cols-2 items-end gap-4">
                <BigResult label={t('calculator.drawVolume')} value={formatVolumeMl(result.drawVolumeUl, locale)} />
                <BigResult
                  // U+2011 keeps "U-100" in one piece if the label has to wrap.
                  label={t('calculator.drawSyringeUnits', { syringeType: syringeType.replace('-', '‑') })}
                  value={formatSyringeUnits(result.drawSyringeUnits, locale)}
                />
              </div>
              <dl className="flex flex-col divide-y divide-white/15 border-t border-white/15 text-sm">
                <DetailRow
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
                <DetailRow label={t('calculator.dosesRemaining')} value={String(result.dosesRemaining)} />
              </dl>
              {result.lowVolumeWarning && (
                <p className="flex items-start gap-2 rounded-2xl bg-black/25 px-3 py-2 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t('calculator.lowVolumeWarning')}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {snapshot && (
        <SaveToProtocol
          compound={compound}
          snapshot={snapshot}
          targetId={saveTargetId}
          onTargetChange={setSaveTargetId}
          onCreateProtocol={() => onCreateProtocol(compound.id)}
        />
      )}
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
  targetId,
  onTargetChange,
  onCreateProtocol,
}: {
  compound: Compound
  snapshot: MixSnapshot
  targetId: string | null
  onTargetChange: (id: string) => void
  onCreateProtocol: () => void
}) {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const [busy, setBusy] = useState(false)

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
    saved.drawSyringeUnits === snapshot.drawSyringeUnits &&
    saved.doseAmount === snapshot.doseAmount &&
    saved.doseUnit === snapshot.doseUnit

  async function handleSave() {
    if (!target) return
    setBusy(true)
    try {
      await db.protocols.update(target.id, { reconstitution: { ...snapshot, savedAt: new Date().toISOString() } })
      toast.success(t('calculator.saved', { name: target.name || compound.name }))
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
                    className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
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
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** A numbered section of the form: a step badge and a plain-language question, then its fields. */
function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-primary">
          {number}
        </span>
        <h2 className="font-display text-lg font-bold leading-tight text-foreground">{title}</h2>
      </div>
      {children}
    </section>
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
        className={`min-h-14 rounded-2xl px-5 text-lg ${suffix ? 'pr-16' : ''}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-lg text-muted-foreground">
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
          className={`min-h-11 rounded-full border px-3 text-sm font-medium transition-colors ${
            value === opt ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
          }`}
        >
          {opt} {suffix}
        </button>
      ))}
    </div>
  )
}

/** One of the two numbers the screen exists to produce, on the brand surface. */
function BigResult({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium leading-tight text-white/70">{label}</p>
      <p className="mt-1.5 truncate font-display text-[2.5rem] font-bold leading-none tabular-nums">{value}</p>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-white/70">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
