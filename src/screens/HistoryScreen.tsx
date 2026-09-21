import { isToday, isYesterday } from 'date-fns'
import { Check, History as HistoryIcon, Search, Trash2 } from 'lucide-react'
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
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '../components/EmptyState'
import { AppHeader } from '../components/AppHeader'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime, toIsoDate } from '../lib/dates'
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

/** "Today" / "Yesterday" for the last two days, the plain date after that. */
function dayHeading(date: Date, t: (key: string) => string): string {
  if (isToday(date)) return t('home.today')
  if (isYesterday(date)) return t('history.yesterday')
  return formatDate(date)
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

  // `filtered` is already newest-first, so consecutive entries on the same
  // calendar day are adjacent and a single pass is enough.
  const groups = useMemo(() => {
    const out: { key: string; date: Date; logs: DoseLog[] }[] = []
    for (const log of filtered) {
      const date = new Date(log.administeredAt)
      const key = toIsoDate(date)
      const last = out[out.length - 1]
      if (last && last.key === key) last.logs.push(log)
      else out.push({ key, date, logs: [log] })
    }
    return out
  }, [filtered])

  if (editingId) {
    const log = (logs ?? []).find((l) => l.id === editingId)
    if (log) {
      return <HistoryEditForm log={log} onDone={() => setEditingId(null)} />
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-2">
      <AppHeader title={t('nav.history')} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('history.searchPlaceholder')}
          className="pl-10"
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

      {/* One card per day, one hairline-divided row per entry: the day is said
          once in the heading instead of being repeated inside every row. */}
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{dayHeading(group.date, t)}</h2>
          <Card className="divide-y divide-border">
            {group.logs.map((log) => {
              const compound = getCompoundById(log.compoundId)
              const taken = log.status === 'taken'
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setEditingId(log.id)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {compound?.name ?? t('history.unknownCompound')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(new Date(log.administeredAt))} · {doseLabel(log, locale)}
                    </span>
                  </span>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-xs font-medium ${
                      taken ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {taken && <Check className="size-3.5" />}
                    {t(`history.status.${log.status}`)}
                  </span>
                </button>
              )
            })}
          </Card>
        </section>
      ))}
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
    <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
      <AppHeader title={compound?.name ?? t('history.unknownCompound')} onBack={onDone} />

      <FormField label={t('history.date')}>
        <DatePicker value={date} onChange={setDate} />
      </FormField>

      <FormField label={t('history.time')}>
        <TimePicker value={time} onChange={setTime} />
      </FormField>

      <FormField label={t('history.doseAmount')}>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-h-11 flex-1 rounded-full border border-input bg-card px-4 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {isIU ? (
            <span className="flex min-h-11 items-center px-3 text-muted-foreground">IU</span>
          ) : (
            <Segmented
              ariaLabel="mg / mcg"
              className="w-36 shrink-0"
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'mg', label: 'mg' },
                { value: 'mcg', label: 'mcg' },
              ]}
            />
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
              className={`min-h-11 flex-1 rounded-full border text-sm font-medium transition-colors ${
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
          className="w-full rounded-2xl border border-input bg-card px-4 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
