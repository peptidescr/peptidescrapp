import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { getCompoundById } from '../content/compounds'
import { formatDateTime, formatTime, toIsoDate } from '../lib/dates'
import { db, type DoseLog, type DoseStatus } from '../lib/db'
import { useLiveQuery } from '../lib/useLiveQuery'
import {
  formatDecimal,
  iuFromMilliIU,
  mgFromMicrograms,
  microgramsFromMass,
  milliIUFromIU,
  type Locale,
  type MassUnit,
  type Microgram,
  type MilliIU,
} from '../lib/units'

function doseLabel(log: DoseLog, locale: Locale): string {
  const compound = getCompoundById(log.compoundId)
  if (log.doseIU !== undefined) {
    return `${formatDecimal(iuFromMilliIU(log.doseIU as MilliIU), locale, 2)} IU`
  }
  if (log.doseMcg !== undefined) {
    const unit: MassUnit = compound?.defaultUnit === 'mcg' ? 'mcg' : 'mg'
    const amount = unit === 'mcg' ? log.doseMcg : mgFromMicrograms(log.doseMcg as Microgram)
    return `${formatDecimal(amount, locale, unit === 'mcg' ? 0 : 3)} ${unit}`
  }
  return '—'
}

export function HistoryScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const logs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...(logs ?? [])].sort(
      (a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime(),
    )
  }, [logs])

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.trim().toLowerCase()
    return sorted.filter((log) => {
      const compound = getCompoundById(log.compoundId)
      return (
        compound?.name.toLowerCase().includes(q) ||
        log.notes?.toLowerCase().includes(q)
      )
    })
  }, [sorted, search])

  if (editingId) {
    const log = (logs ?? []).find((l) => l.id === editingId)
    if (log) {
      return <HistoryEditForm log={log} onDone={() => setEditingId(null)} />
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <h1 className="text-xl font-semibold">{t('nav.history')}</h1>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('history.searchPlaceholder')}
        className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
      />

      {logs !== undefined && filtered.length === 0 && (
        <EmptyState title={t('history.emptyTitle')} body={t('history.emptyBody')} />
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((log) => {
          const compound = getCompoundById(log.compoundId)
          return (
            <button
              key={log.id}
              type="button"
              onClick={() => setEditingId(log.id)}
              className="min-h-11 rounded-2xl border border-brand-border bg-brand-surface p-4 text-left shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-brand-ink">{compound?.name ?? t('history.unknownCompound')}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    log.status === 'taken' ? 'bg-brand-primary-lt text-brand-primary' : 'bg-brand-surface-2 text-brand-muted'
                  }`}
                >
                  {t(`history.status.${log.status}`)}
                </span>
              </div>
              <p className="text-sm text-brand-muted">
                {formatDateTime(new Date(log.administeredAt))} · {doseLabel(log, locale)}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function HistoryEditForm({ log, onDone }: { log: DoseLog; onDone: () => void }) {
  const { t } = useTranslation()
  const compound = getCompoundById(log.compoundId)
  const isIU = log.doseIU !== undefined
  const initialUnit: MassUnit = compound?.defaultUnit === 'mcg' ? 'mcg' : 'mg'
  const initialAmount = isIU
    ? iuFromMilliIU(log.doseIU as MilliIU)
    : initialUnit === 'mcg'
      ? (log.doseMcg ?? 0)
      : mgFromMicrograms((log.doseMcg ?? 0) as Microgram)

  const administered = new Date(log.administeredAt)
  const [date, setDate] = useState(toIsoDate(administered))
  const [time, setTime] = useState(formatTime(administered))
  const [amount, setAmount] = useState(String(initialAmount).replace('.', ','))
  const [unit, setUnit] = useState<MassUnit>(initialUnit)
  const [status, setStatus] = useState<DoseStatus>(log.status)
  const [notes, setNotes] = useState(log.notes ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleSave() {
    const [hours, minutes] = time.split(':').map(Number)
    const administeredAt = new Date(date)
    administeredAt.setHours(hours ?? 0, minutes ?? 0, 0, 0)
    const numericAmount = Number(amount.replace(',', '.')) || 0

    const patch: Partial<DoseLog> = {
      administeredAt: administeredAt.toISOString(),
      status,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    if (isIU) {
      patch.doseIU = milliIUFromIU(numericAmount)
    } else {
      patch.doseMcg = microgramsFromMass(numericAmount, unit)
    }
    await db.doseLogs.update(log.id, patch)
    onDone()
  }

  async function handleDelete() {
    await db.doseLogs.delete(log.id)
    onDone()
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onDone} className="min-h-11 text-brand-primary">
          {t('common.cancel')}
        </button>
        <h1 className="text-lg font-semibold">{compound?.name ?? t('history.unknownCompound')}</h1>
        <div className="w-16" />
      </div>

      <FormField label={t('history.date')}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
        />
      </FormField>

      <FormField label={t('history.time')}>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
        />
      </FormField>

      <FormField label={t('history.doseAmount')}>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-brand-border bg-brand-surface px-3"
          />
          {isIU ? (
            <span className="flex min-h-11 items-center px-3 text-brand-muted">IU</span>
          ) : (
            <div className="flex overflow-hidden rounded-xl border border-brand-border">
              {(['mg', 'mcg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-h-11 px-3 text-sm font-medium ${
                    unit === u ? 'bg-brand-primary text-white' : 'bg-brand-surface text-brand-muted'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>
      </FormField>

      <FormField label={t('history.status.label')}>
        <div className="flex gap-2">
          {(['taken', 'skipped'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium ${
                status === s
                  ? 'border-brand-primary bg-brand-primary-lt text-brand-primary'
                  : 'border-brand-border text-brand-muted'
              }`}
            >
              {t(`history.status.${s}`)}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label={t('history.notes')}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-brand-border bg-brand-surface px-3 py-2"
        />
      </FormField>

      <Button onClick={handleSave}>{t('common.save')}</Button>

      {confirmingDelete ? (
        <Button variant="danger" onClick={handleDelete}>
          {t('history.confirmDelete')}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="min-h-11 text-sm text-brand-warn"
        >
          {t('common.delete')}
        </button>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-brand-ink">{label}</span>
      {children}
    </label>
  )
}
