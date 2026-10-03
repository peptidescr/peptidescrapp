import { addDays, parseISO } from 'date-fns'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Segmented } from '@/components/ui/segmented'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { BRAND } from '../brand'
import { getCompoundById } from '../content/compounds'
import { MAX_LOT_LENGTH } from '../lib/backupValidation'
import { toIsoDate } from '../lib/dates'
import type { Vial } from '../lib/db'
import { sanitizeText } from '../lib/sanitize'
import { parseDecimal, type MassUnit } from '../lib/units'
import { startVial, updateVialDetails } from '../lib/vials'
import { DatePicker } from './DatePicker'

/** What a caller already knows about the vial being started (e.g. from the calculator's mix). */
export interface VialPrefill {
  amount?: number
  amountUnit?: MassUnit | 'IU'
  diluentMl?: number
}

/**
 * Start tracking a vial for a protocol, or edit an existing vial's details.
 * Starting one closes the protocol's current vial as finished (see
 * startVial). Editing covers only the dates and label details — the
 * starting amount is fixed once doses have been counted against it.
 */
export function VialSheet({
  open,
  onOpenChange,
  compoundId,
  protocolId,
  prefill,
  vial,
  replacesActive = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  compoundId: string
  protocolId?: string
  prefill?: VialPrefill
  /** Present to edit this vial's details; absent to start a new one. */
  vial?: Vial
  /** The protocol already has an active vial that starting this one will close. */
  replacesActive?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{vial ? t('vials.editTitle') : t('vials.newTitle')}</SheetTitle>
          {!vial && <SheetDescription>{t('vials.newBody')}</SheetDescription>}
        </SheetHeader>
        <SheetBody>
          <VialForm
            key={vial?.id ?? `${compoundId}-${protocolId ?? ''}-${prefill?.amount ?? ''}`}
            compoundId={compoundId}
            protocolId={protocolId}
            prefill={prefill}
            vial={vial}
            replacesActive={replacesActive}
            onDone={() => onOpenChange(false)}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function VialForm({
  compoundId,
  protocolId,
  prefill,
  vial,
  replacesActive,
  onDone,
}: {
  compoundId: string
  protocolId?: string
  prefill?: VialPrefill
  vial?: Vial
  replacesActive: boolean
  onDone: () => void
}) {
  const { t } = useTranslation()
  const compound = getCompoundById(compoundId)
  const isIU = compound?.defaultUnit === 'IU'
  // A catalogue vial size is only a starting amount for powders and IU
  // compounds; a solution's sizes are millilitres of liquid, not an amount.
  const catalogueAmount = compound && compound.form === 'powder' ? compound.vialSizes[0] : undefined
  const today = toIsoDate(new Date())

  const [amount, setAmount] = useState(
    String(prefill?.amount ?? catalogueAmount ?? '').replace('.', ','),
  )
  const [amountUnit, setAmountUnit] = useState<MassUnit>(
    prefill?.amountUnit && prefill.amountUnit !== 'IU'
      ? prefill.amountUnit
      : compound?.defaultUnit === 'mcg'
        ? 'mcg'
        : 'mg',
  )
  const [diluent, setDiluent] = useState(
    prefill?.diluentMl !== undefined ? String(prefill.diluentMl).replace('.', ',') : '',
  )
  const [openedOn, setOpenedOn] = useState(vial?.openedOn ?? today)
  const [discardOn, setDiscardOn] = useState(
    vial?.discardOn ??
      (BRAND.defaultDiscardDays !== undefined
        ? toIsoDate(addDays(parseISO(today), BRAND.defaultDiscardDays))
        : ''),
  )
  const [expiresOn, setExpiresOn] = useState(vial?.expiresOn ?? '')
  const [lot, setLot] = useState(vial?.lot ?? '')
  const [batch, setBatch] = useState(vial?.batch ?? '')
  const [saving, setSaving] = useState(false)

  const amountValue = parseDecimal(amount)
  const canSave = !saving && (vial !== undefined || (amountValue !== null && amountValue > 0))

  async function handleSave() {
    setSaving(true)
    try {
      const details = {
        openedOn,
        discardOn: discardOn || undefined,
        expiresOn: expiresOn || undefined,
        lot: sanitizeText(lot, MAX_LOT_LENGTH).trim() || undefined,
        batch: sanitizeText(batch, MAX_LOT_LENGTH).trim() || undefined,
      }
      if (vial) {
        await updateVialDetails(vial.id, details)
        toast.success(t('vials.updated'))
      } else {
        const diluentMl = parseDecimal(diluent)
        await startVial({
          compoundId,
          protocolId,
          amount: amountValue ?? 0,
          amountUnit: isIU ? 'IU' : amountUnit,
          diluentMl: diluentMl ?? undefined,
          ...details,
        })
        toast.success(t('vials.started'))
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!vial && (
        <>
          <FormRow label={t('vials.amount')}>
            <div className="flex items-center gap-2">
              <NumericInput
                kind="decimal"
                value={amount}
                onValueChange={setAmount}
                className="flex-1"
              />
              {isIU ? (
                <span className="w-10 text-sm text-muted-foreground">IU</span>
              ) : (
                <Segmented
                  ariaLabel={t('vials.amount')}
                  value={amountUnit}
                  onChange={setAmountUnit}
                  options={[
                    { value: 'mg', label: 'mg' },
                    { value: 'mcg', label: 'mcg' },
                  ]}
                  className="w-32"
                />
              )}
            </div>
          </FormRow>
          {compound?.form !== 'solution' && (
            <FormRow label={t('vials.diluent')} optional>
              <NumericInput kind="decimal" value={diluent} onValueChange={setDiluent} />
            </FormRow>
          )}
        </>
      )}
      <FormRow label={t('vials.openedOn')}>
        <DatePicker value={openedOn} onChange={setOpenedOn} />
      </FormRow>
      <FormRow label={t('vials.discardOn')} optional hint={t('vials.discardHint')}>
        <ClearableDate value={discardOn} onChange={setDiscardOn} />
      </FormRow>
      <FormRow label={t('vials.expiresOn')} optional>
        <ClearableDate value={expiresOn} onChange={setExpiresOn} />
      </FormRow>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label={t('vials.lot')} optional>
          <Input
            value={lot}
            maxLength={MAX_LOT_LENGTH}
            autoCapitalize="characters"
            onChange={(e) => setLot(e.target.value)}
          />
        </FormRow>
        <FormRow label={t('vials.batch')} optional>
          <Input
            value={batch}
            maxLength={MAX_LOT_LENGTH}
            autoCapitalize="characters"
            onChange={(e) => setBatch(e.target.value)}
          />
        </FormRow>
      </div>
      {!vial && replacesActive && (
        <p className="text-sm text-muted-foreground">{t('vials.replacesActive')}</p>
      )}
      <Button onClick={() => void handleSave()} disabled={!canSave} className="mt-2">
        {vial ? t('common.save') : t('vials.startCta')}
      </Button>
    </div>
  )
}

function FormRow({
  label,
  optional = false,
  hint,
  children,
}: {
  label: string
  optional?: boolean
  hint?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground"> · {t('vials.optional')}</span>
        )}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** DatePicker with a way back to "no date" — it has no empty state of its own once set. */
function ClearableDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <DatePicker value={value} onChange={onChange} />
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('vials.clearDate')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
