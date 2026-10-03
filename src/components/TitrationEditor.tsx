import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NumericInput } from '@/components/ui/numeric-input'
import { MAX_WEEK_COUNT } from '../lib/sanitize'
import { MAX_TITRATION_STEPS } from '../lib/titration'
import type { ParsedTitrationFields, TitrationFields } from '../lib/titrationForm'

/**
 * The step plan for a dose that changes over time. Step 1's dose is the
 * form's own dose field (shown here, not edited twice); each later step has
 * its own dose, and every step but the last says how many weeks it lasts.
 */
export function TitrationEditor({
  fields,
  parsed,
  firstDose,
  unit,
  onChange,
}: {
  fields: TitrationFields
  parsed: ParsedTitrationFields
  firstDose: number | null
  unit: string
  onChange: (patch: Partial<TitrationFields>) => void
}) {
  const { t } = useTranslation()
  const lastIndex = fields.later.length - 1

  function updateStep(index: number, patch: Partial<TitrationFields['later'][number]>) {
    onChange({ later: fields.later.map((step, i) => (i === index ? { ...step, ...patch } : step)) })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <p className="text-sm text-muted-foreground">{t('protocols.titrationHint')}</p>

      <StepRow title={t('protocols.step', { n: 1 })}>
        <div className="flex min-h-11 flex-1 items-center px-1 text-base text-foreground">
          {firstDose !== null ? `${firstDose} ${unit}` : '—'}
        </div>
        <WeeksField
          label={t('protocols.stepWeeks')}
          value={fields.firstWeeks}
          invalid={parsed.firstWeeks === null}
          onChange={(firstWeeks) => onChange({ firstWeeks })}
        />
      </StepRow>

      {fields.later.map((step, index) => {
        const isLast = index === lastIndex
        return (
          <StepRow
            key={index}
            title={t('protocols.step', { n: index + 2 })}
            action={
              fields.later.length > 1 && (
                <button
                  type="button"
                  aria-label={t('protocols.removeStep', { n: index + 2 })}
                  onClick={() => onChange({ later: fields.later.filter((_, i) => i !== index) })}
                  className="-my-2 -mr-2 flex size-11 items-center justify-center text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              )
            }
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('protocols.stepDose', { unit })}</span>
              <NumericInput
                kind="decimal"
                value={step.dose}
                onValueChange={(dose) => updateStep(index, { dose })}
                aria-invalid={step.dose !== '' && parsed.later[index]?.dose === null}
              />
            </label>
            {isLast ? (
              <p className="flex min-h-11 flex-1 items-end pb-3 text-xs text-muted-foreground">{t('protocols.stepHolds')}</p>
            ) : (
              <WeeksField
                label={t('protocols.stepWeeks')}
                value={step.weeks}
                invalid={parsed.later[index]?.weeks === null}
                onChange={(weeks) => updateStep(index, { weeks })}
              />
            )}
          </StepRow>
        )
      })}

      {parsed.titration === null && firstDose !== null && (
        <p role="alert" className="text-sm text-destructive">
          {t('protocols.invalidStep', { max: MAX_WEEK_COUNT })}
        </p>
      )}

      {fields.later.length + 1 < MAX_TITRATION_STEPS && (
        <button
          type="button"
          onClick={() => onChange({ later: [...fields.later, { dose: '', weeks: '4' }] })}
          className="flex min-h-11 items-center gap-1 self-start text-sm text-primary"
        >
          <Plus className="size-4" />
          {t('protocols.addStep')}
        </button>
      )}
    </div>
  )
}

function StepRow({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {action}
      </div>
      <div className="flex items-end gap-3">{children}</div>
    </div>
  )
}

function WeeksField({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <NumericInput kind="integer" value={value} onValueChange={onChange} aria-invalid={invalid} />
    </label>
  )
}
