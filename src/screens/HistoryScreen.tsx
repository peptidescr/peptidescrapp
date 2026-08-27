import { ChevronLeft, History as HistoryIcon, Search, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DatePicker } from '@/components/DatePicker'
import { TimePicker } from '@/components/TimePicker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
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

type StatusFilter = 'all' | DoseStatus

export function HistoryScreen() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const logs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return [...(logs ?? [])].sort(
      (a, b) => new Date(b.administeredAt).getTime() - new Date(a.administeredAt).getTime(),
    )
  }, [logs])

  const filtered = useMemo(() => {
    return sorted.filter((log) => {
      if (statusFilter !== 'all' && log.status !== statusFilter) return false
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      const compound = getCompoundById(log.compoundId)
      return compound?.name.toLowerCase().includes(q) || log.notes?.toLowerCase().includes(q)
    })
  }, [sorted, search, statusFilter])

  if (editingId) {
    const log = (logs ?? []).find((l) => l.id === editingId)
    if (log) {
      return <HistoryEditForm log={log} onDone={() => setEditingId(null)} />
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <h1 className="text-xl font-semibold">{t('nav.history')}</h1>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('history.searchPlaceholder')}
          className="min-h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex gap-2">
        {(['all', 'taken', 'skipped'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors ${
              statusFilter === f ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {f === 'all' ? t('history.filterAll') : t(`history.status.${f}`)}
          </button>
        ))}
      </div>

      {logs !== undefined && filtered.length === 0 && (
        <EmptyState icon={HistoryIcon} title={t('history.emptyTitle')} body={t('history.emptyBody')} />
      )}

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {filtered.map((log) => {
            const compound = getCompoundById(log.compoundId)
            return (
              <motion.button
                key={log.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={() => setEditingId(log.id)}
                className="min-h-11 rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{compound?.name ?? t('history.unknownCompound')}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      log.status === 'taken' ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t(`history.status.${log.status}`)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(new Date(log.administeredAt))} · {doseLabel(log, locale)}
                </p>
              </motion.button>
            )
          })}
        </AnimatePresence>
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
    toast.success(t('history.saved'))
    onDone()
  }

  async function handleDelete() {
    await db.doseLogs.delete(log.id)
    toast.success(t('history.deleted'))
    onDone()
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onDone} className="flex min-h-11 items-center gap-1 text-primary">
          <ChevronLeft className="size-5" />
          {t('common.cancel')}
        </button>
        <h1 className="text-lg font-semibold">{compound?.name ?? t('history.unknownCompound')}</h1>
        <div className="w-16" />
      </div>

      <FormField label={t('history.date')}>
        <DatePicker value={date} onChange={setDate} />
      </FormField>

      <FormField label={t('history.time')}>
        <TimePicker value={time} onChange={setTime} />
      </FormField>

      <FormField label={t('history.doseAmount')}>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {isIU ? (
            <span className="flex min-h-11 items-center px-3 text-muted-foreground">IU</span>
          ) : (
            <div className="flex overflow-hidden rounded-xl border border-border">
              {(['mg', 'mcg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-h-11 px-3 text-sm font-medium transition-colors ${
                    unit === u ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
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
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium transition-colors ${
                status === s ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
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
          className="w-full rounded-xl border border-input bg-card px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FormField>

      <Button onClick={handleSave}>{t('common.save')}</Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button type="button" className="flex min-h-11 items-center justify-center gap-1.5 text-sm text-destructive">
            <Trash2 className="size-4" />
            {t('common.delete')}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('history.deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('history.deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
