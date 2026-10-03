import { isSameDay, isToday, isYesterday } from 'date-fns'
import { Check, History as HistoryIcon, Search, Trash2 } from 'lucide-react'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DayButtonProps } from 'react-day-picker'
import { enUS, es } from 'react-day-picker/locale'
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
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { DueCard } from '../components/DoseCard'
import { EmptyState } from '../components/EmptyState'
import { AppHeader } from '../components/AppHeader'
import { getCompoundById } from '../content/compounds'
import { formatDate, formatTime, toHHmm, toIsoDate } from '../lib/dates'
import { MAX_NOTES_LENGTH, parsePositiveAmount, sanitizeMultiline } from '../lib/sanitize'
import { NumericInput } from '@/components/ui/numeric-input'
import { db, type DoseLog, type DoseStatus, type Protocol } from '../lib/db'
import { computeDaySlots, computeMonthMarks, type DayMarks } from '../lib/historyData'
import { doseOn, formatDose } from '../lib/titration'
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
type HistoryView = 'list' | 'month'

export function HistoryScreen({ onOpenProtocol }: { onOpenProtocol: (protocolId: string) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const logs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const [view, setView] = useState<HistoryView>('list')
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

      <Segmented
        ariaLabel={t('nav.history')}
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: t('calendar.viewList') },
          { value: 'month', label: t('calendar.viewMonth') },
        ]}
      />

      {view === 'month' ? (
        <HistoryMonth
          protocols={protocols ?? []}
          logs={logs ?? []}
          onEditLog={setEditingId}
          onOpenProtocol={onOpenProtocol}
        />
      ) : (
        <HistoryList
          logsLoaded={logs !== undefined}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          groups={groups}
          locale={locale}
          onEditLog={setEditingId}
        />
      )}
    </div>
  )
}

function HistoryList({
  logsLoaded,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  groups,
  locale,
  onEditLog,
}: {
  logsLoaded: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  groups: { key: string; date: Date; logs: DoseLog[] }[]
  locale: Locale
  onEditLog: (id: string) => void
}) {
  const { t } = useTranslation()
  const filteredCount = groups.reduce((n, g) => n + g.logs.length, 0)

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('history.searchPlaceholder')}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2">
        {(['all', 'taken', 'skipped'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onStatusFilterChange(f)}
            className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors ${
              statusFilter === f ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {f === 'all' ? t('history.filterAll') : t(`history.status.${f}`)}
          </button>
        ))}
      </div>

      {logsLoaded && filteredCount === 0 && (
        <EmptyState icon={HistoryIcon} title={t('history.emptyTitle')} body={t('history.emptyBody')} />
      )}

      {/* One card per day, one hairline-divided row per entry: the day is said
          once in the heading instead of being repeated inside every row. */}
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{dayHeading(group.date, t)}</h2>
          <Card className="divide-y divide-border">
            {group.logs.map((log) => (
              <LogRow key={log.id} log={log} locale={locale} onEdit={() => onEditLog(log.id)} />
            ))}
          </Card>
        </section>
      ))}
    </>
  )
}

function LogRow({ log, locale, onEdit }: { log: DoseLog; locale: Locale; onEdit: () => void }) {
  const { t } = useTranslation()
  const compound = getCompoundById(log.compoundId)
  const taken = log.status === 'taken'
  return (
    <button type="button" onClick={onEdit} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
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
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

/**
 * The day markers for the visible month, handed to the calendar's day
 * buttons through context: the custom DayButton has to be a stable component
 * (a new one per render would remount every day button and drop focus), so
 * it can't close over the data directly.
 */
const MonthMarksContext = createContext<Map<string, DayMarks>>(new Map())

const MARK_STYLES: { key: keyof DayMarks; labelKey: string; className: string }[] = [
  { key: 'taken', labelKey: 'calendar.legendTaken', className: 'bg-primary' },
  { key: 'skipped', labelKey: 'calendar.legendSkipped', className: 'bg-muted-foreground' },
  { key: 'missed', labelKey: 'calendar.legendMissed', className: 'bg-destructive' },
  { key: 'scheduled', labelKey: 'calendar.legendScheduled', className: 'border border-muted-foreground' },
]

function MarkedDayButton({ day, modifiers, children, className, ...buttonProps }: DayButtonProps) {
  const marks = useContext(MonthMarksContext).get(toIsoDate(day.date))
  const showMarks = marks !== undefined && !modifiers.outside
  return (
    <button {...buttonProps} className={`${className ?? ''} flex-col gap-0.5`}>
      <span>{children}</span>
      <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
        {showMarks &&
          MARK_STYLES.filter(({ key }) => marks[key] > 0).map(({ key, className: dot }) => (
            // On the selected day the button is filled with the accent colour,
            // which the dots would vanish into — they take its label colour there.
            <span
              key={key}
              className={`size-1.5 rounded-full ${
                modifiers.selected
                  ? key === 'scheduled'
                    ? 'border border-primary-foreground'
                    : 'bg-primary-foreground'
                  : dot
              }`}
            />
          ))}
      </span>
    </button>
  )
}

function HistoryMonth({
  protocols,
  logs,
  onEditLog,
  onOpenProtocol,
}: {
  protocols: Protocol[]
  logs: DoseLog[]
  onEditLog: (id: string) => void
  onOpenProtocol: (protocolId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const [now] = useState(() => new Date())
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())

  const marks = useMemo(() => computeMonthMarks(protocols, logs, month, now), [protocols, logs, month, now])
  const dayLogs = useMemo(
    () =>
      logs
        .filter((log) => isSameDay(new Date(log.administeredAt), selected))
        .sort((a, b) => new Date(a.administeredAt).getTime() - new Date(b.administeredAt).getTime()),
    [logs, selected],
  )
  const slots = useMemo(() => computeDaySlots(protocols, logs, selected, now), [protocols, logs, selected, now])
  const pastSlots = slots.filter((slot) => !slot.isFuture)
  const futureSlots = slots.filter((slot) => slot.isFuture)

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-2">
        <MonthMarksContext.Provider value={marks}>
          <Calendar
            mode="single"
            required
            selected={selected}
            onSelect={setSelected}
            month={month}
            onMonthChange={setMonth}
            locale={i18n.language === 'en' ? enUS : es}
            className="relative w-full"
            classNames={{
              weekday: 'text-muted-foreground flex-1 text-xs font-medium text-center',
              day: 'relative flex-1 h-12 p-0 text-center text-sm',
              day_button:
                'inline-flex h-12 w-full items-center justify-center rounded-lg text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            }}
            components={{ DayButton: MarkedDayButton }}
          />
        </MonthMarksContext.Provider>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pb-2 text-xs text-muted-foreground">
          {MARK_STYLES.map(({ key, labelKey, className }) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${className}`} aria-hidden />
              {t(labelKey)}
            </span>
          ))}
        </div>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{dayHeading(selected, t)}</h2>
        {dayLogs.length === 0 && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('calendar.dayEmpty')}</p>
        )}
        {dayLogs.length > 0 && (
          <Card className="divide-y divide-border">
            {dayLogs.map((log) => (
              <LogRow key={log.id} log={log} locale={locale} onEdit={() => onEditLog(log.id)} />
            ))}
          </Card>
        )}
        {/* Missed or just-due doses can be backfilled right here — the same card as Home's catch-up. */}
        {pastSlots.map((slot) => (
          <DueCard
            key={`${slot.protocol.id}-${slot.occurrence.scheduledAt.toISOString()}`}
            item={{ protocol: slot.protocol, occurrence: slot.occurrence, isMissed: slot.isMissed }}
            now={now}
            onOpenProtocol={onOpenProtocol}
          />
        ))}
        {futureSlots.length > 0 && (
          <Card className="divide-y divide-border">
            {futureSlots.map((slot) => (
              <button
                key={`${slot.protocol.id}-${slot.occurrence.scheduledAt.toISOString()}`}
                type="button"
                onClick={() => onOpenProtocol(slot.protocol.id)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {slot.protocol.name || getCompoundById(slot.protocol.compoundId)?.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(slot.occurrence.scheduledAt)} · {formatDose(doseOn(slot.protocol, slot.occurrence.scheduledAt))}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {t('calendar.legendScheduled')}
                </span>
              </button>
            ))}
          </Card>
        )}
      </section>
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
  // The picker's value is the stored 24h form; formatTime would be the 12h display string.
  const [time, setTime] = useState(toHHmm(administered))
  const [amount, setAmount] = useState(String(initialAmount).replace('.', ','))
  const [unit, setUnit] = useState<MassUnit>(initialUnit)
  const [status, setStatus] = useState<DoseStatus>(log.status)
  const [notes, setNotes] = useState(log.notes ?? '')

  const numericAmount = parsePositiveAmount(amount)

  async function handleSave() {
    const [hours, minutes] = time.split(':').map(Number)
    const administeredAt = new Date(date)
    administeredAt.setHours(hours ?? 0, minutes ?? 0, 0, 0)
    if (numericAmount === null) return

    const patch: Partial<DoseLog> = {
      administeredAt: administeredAt.toISOString(),
      status,
      notes: sanitizeMultiline(notes).trim() || undefined,
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
          <NumericInput
            kind="decimal"
            value={amount}
            onValueChange={setAmount}
            aria-invalid={numericAmount === null}
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
          onChange={(e) => setNotes(sanitizeMultiline(e.target.value))}
          maxLength={MAX_NOTES_LENGTH}
          rows={3}
          className="w-full rounded-2xl border border-input bg-card px-4 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FormField>

      <Button onClick={handleSave} disabled={numericAmount === null}>
        {t('common.save')}
      </Button>

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
