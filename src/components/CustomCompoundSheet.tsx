import { useState } from 'react'
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
import type { Compound, CompoundForm, CompoundUnit } from '../content/compounds'
import {
  createCustomCompound,
  deleteCustomCompound,
  isCompoundInUse,
  updateCustomCompound,
} from '../lib/customCompounds'
import { MAX_NAME_LENGTH } from '../lib/sanitize'
import { parseDecimal } from '../lib/units'

/**
 * Add or edit one of the user's own compounds. Opened from the compound
 * pickers ("Add your own compound") and from Settings → Your compounds.
 * `onSaved` hands back the saved compound so a picker can select it at once.
 */
export function CustomCompoundSheet({
  open,
  onOpenChange,
  compound,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; absent to create a new one. */
  compound?: Compound
  onSaved?: (compound: Compound) => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{compound ? t('compounds.editTitle') : t('compounds.newTitle')}</SheetTitle>
          {!compound && <SheetDescription>{t('compounds.addCustomHint')}</SheetDescription>}
        </SheetHeader>
        <SheetBody>
          {/* Keyed so reopening for a different compound starts from its own values. */}
          <CustomCompoundForm
            key={compound?.id ?? 'new'}
            compound={compound}
            onDone={(saved) => {
              onOpenChange(false)
              if (saved) onSaved?.(saved)
            }}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function CustomCompoundForm({
  compound,
  onDone,
}: {
  compound?: Compound
  onDone: (saved?: Compound) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(compound?.name ?? '')
  const [unit, setUnit] = useState<CompoundUnit>(compound?.defaultUnit ?? 'mg')
  const [form, setForm] = useState<CompoundForm>(compound?.form ?? 'powder')
  const [vialSize, setVialSize] = useState(
    compound?.vialSizes[0] !== undefined ? String(compound.vialSizes[0]) : '',
  )
  const [saving, setSaving] = useState(false)

  const sizeUnit = form === 'solution' && unit !== 'IU' ? 'mL' : unit
  const canSave = name.trim().length > 0 && !saving

  async function handleSave() {
    setSaving(true)
    try {
      const size = parseDecimal(vialSize)
      const input = {
        name,
        defaultUnit: unit,
        form,
        vialSizes: size !== null && size > 0 ? [size] : [],
      }
      const saved = compound
        ? await updateCustomCompound(compound.id, input)
        : await createCustomCompound(input)
      toast.success(t('compounds.saved'))
      onDone(saved)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!compound) return
    if (await isCompoundInUse(compound.id)) {
      toast.error(t('compounds.inUse'))
      return
    }
    await deleteCustomCompound(compound.id)
    toast.success(t('compounds.deleted'))
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t('compounds.name')}</span>
        <Input
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t('compounds.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t('compounds.unit')}</span>
        <Segmented
          ariaLabel={t('compounds.unit')}
          value={unit}
          onChange={setUnit}
          options={[
            { value: 'mg', label: 'mg' },
            { value: 'mcg', label: 'mcg' },
            { value: 'IU', label: 'IU' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t('compounds.form')}</span>
        <Segmented
          ariaLabel={t('compounds.form')}
          value={form}
          onChange={setForm}
          options={[
            { value: 'powder', label: t('compounds.formPowder') },
            { value: 'solution', label: t('compounds.formSolution') },
          ]}
        />
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">{t('compounds.vialSize')}</span>
        <div className="flex items-center gap-2">
          <NumericInput
            kind="decimal"
            value={vialSize}
            onValueChange={setVialSize}
            className="flex-1"
          />
          <span className="w-10 text-sm text-muted-foreground">{sizeUnit}</span>
        </div>
      </label>
      <Button onClick={() => void handleSave()} disabled={!canSave} className="mt-2">
        {t('common.save')}
      </Button>
      {compound && (
        <Button variant="danger" onClick={() => void handleDelete()}>
          {t('common.delete')}
        </Button>
      )}
    </div>
  )
}
