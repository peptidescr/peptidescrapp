import {
  ChevronRight,
  ClipboardList,
  type LucideIcon,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
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
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '../components/EmptyState'
import { AppHeader } from '../components/AppHeader'
import { TemplatePicker } from '../components/TemplatePicker'
import { getCompoundById, listSelectableCompounds } from '../content/compounds'
import type { ProtocolTemplate } from '../content/protocolTemplates'
import { formatDateTime, toIsoDate } from '../lib/dates'
import { db, type DoseLog, type Protocol, type Route } from '../lib/db'
import { computeProtocolStats } from '../lib/homeData'
import { scheduleUpcomingReminders } from '../lib/notifications'
import type { Schedule, Weekday } from '../lib/schedule'
import { useLiveQuery } from '../lib/useLiveQuery'
import type { MassUnit } from '../lib/units'

/** Reminder scheduling (best-effort, Chromium-only — see notifications.ts) needs to pick
 * up new/changed/deactivated protocols right away, not just on the next app open. */
async function rescheduleReminders(): Promise<void> {
  const protocols = await db.protocols.toArray()
  await scheduleUpcomingReminders(protocols)
}

const WEEKDAY_LABELS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const SCHEDULE_KINDS: Schedule['kind'][] = ['daily', 'everyNDays', 'weekdays', 'cycle']
const ROUTES: Route[] = ['subcutaneous', 'intramuscular', 'other']

type Mode =
  | { kind: 'list' }
  | { kind: 'picker' }
  | { kind: 'form'; protocolId?: string; template?: ProtocolTemplate }

/** Mirrors the "My Protocols / Templates" tabs pattern from reference peptide-tracker
 * apps — templates are browsable any time, not just at the moment of creation. */
type ListTab = 'mine' | 'templates'

export function ProtocolsScreen() {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [listTab, setListTab] = useState<ListTab>('mine')

  if (mode.kind === 'picker') {
    return (
      <div className="flex flex-col gap-6 px-4 pb-6 pt-4">
        <AppHeader title={t('templates.pickerTitle')} onBack={() => setMode({ kind: 'list' })} />
        <TemplatePicker
          onSelectTemplate={(template) => setMode({ kind: 'form', template })}
          onSelectCustom={() => setMode({ kind: 'form' })}
        />
      </div>
    )
  }

  if (mode.kind === 'form') {
    return (
      <ProtocolForm
        protocolId={mode.protocolId}
        template={mode.template}
        onDone={() => setMode({ kind: 'list' })}
      />
    )
  }

  const all = protocols ?? []
  const activeProtocols = all.filter((p) => p.isActive)
  const pausedProtocols = all.filter((p) => !p.isActive)

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-4">
      <AppHeader
        title={t('nav.protocols')}
        action={
          <Button onClick={() => setMode({ kind: 'picker' })}>
            <Plus className="size-4" />
            {t('protocols.new')}
          </Button>
        }
      />

      {all.length > 0 && (
        <p className="-mt-3 text-sm text-muted-foreground">
          {t('protocols.headerStats', { total: all.length, active: activeProtocols.length })}
        </p>
      )}

      <div className="flex overflow-hidden rounded-full border border-border">
        {(['mine', 'templates'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setListTab(tab)}
            className={`min-h-11 flex-1 text-sm font-medium transition-colors ${
              listTab === tab ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
            }`}
          >
            {tab === 'mine' ? t('protocols.tabMine') : t('protocols.tabTemplates')}
          </button>
        ))}
      </div>

      {listTab === 'templates' ? (
        <TemplatePicker
          onSelectTemplate={(template) => setMode({ kind: 'form', template })}
          onSelectCustom={() => setMode({ kind: 'form' })}
        />
      ) : (
        <>
          {protocols !== undefined && all.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title={t('protocols.emptyTitle')}
              body={t('protocols.emptyBody')}
              action={
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => setMode({ kind: 'form' })}>{t('protocols.emptyCreateCta')}</Button>
                  <Button variant="secondary" onClick={() => setListTab('templates')}>
                    {t('protocols.emptyTemplatesCta')}
                  </Button>
                </div>
              }
            />
          )}

          {/* Active and paused are separate sections rather than one list
              sorted by isActive: a paused protocol is a different kind of
              thing, not just a lower-priority active one, and grouping makes
              "why isn't this reminding me?" answerable at a glance. */}
          {([
            { key: 'active' as const, items: activeProtocols },
            { key: 'paused' as const, items: pausedProtocols },
          ]).map(({ key, items }) =>
            items.length === 0 ? null : (
              <section key={key} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {key === 'active'
                    ? t('protocols.sectionActive')
                    : t('protocols.sectionPaused', { count: items.length })}
                </h2>
                <AnimatePresence initial={false}>
                  {items.map((protocol) => (
                    <motion.div
                      key={protocol.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <ProtocolRow
                        protocol={protocol}
                        doseLogs={doseLogs ?? []}
                        onEdit={() => setMode({ kind: 'form', protocolId: protocol.id })}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </section>
            ),
          )}
        </>
      )}
    </div>
  )
}

function ProtocolRow({
  protocol,
  doseLogs,
  onEdit,
}: {
  protocol: Protocol
  doseLogs: DoseLog[]
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const stats = useMemo(() => computeProtocolStats(protocol, doseLogs, new Date()), [protocol, doseLogs])

  async function toggleActive() {
    setMenuOpen(false)
    await db.protocols.update(protocol.id, { isActive: !protocol.isActive })
    void rescheduleReminders()
  }

  async function handleDelete() {
    setConfirmDelete(false)
    setMenuOpen(false)
    await db.protocols.delete(protocol.id)
    // Dose logs are deliberately NOT deleted with the protocol. They're the
    // record of something that actually happened to the person, and DoseLog
    // already treats protocolId as optional — History renders from compoundId,
    // so past entries survive intact and simply stop being tied to a schedule.
    void rescheduleReminders()
    toast.success(t('protocols.deleted'))
  }

  return (
    <Card className={protocol.isActive ? undefined : 'bg-muted opacity-70 shadow-none'}>
      <div className="flex items-start justify-between gap-2 p-4 pb-0">
        <button type="button" onClick={onEdit} className="min-h-11 flex-1 text-left">
          <p className="font-medium text-foreground">{protocol.name || compound?.name}</p>
          <p className="text-sm text-muted-foreground">{compound?.name}</p>
        </button>

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('protocols.menuLabel')}
              className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            >
              <MoreVertical className="size-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <MenuItem
              icon={Pencil}
              label={t('common.edit')}
              onClick={() => {
                setMenuOpen(false)
                onEdit()
              }}
            />
            <MenuItem
              icon={protocol.isActive ? Pause : Play}
              label={protocol.isActive ? t('protocols.pause') : t('protocols.resume')}
              onClick={toggleActive}
            />
            <MenuItem
              icon={Trash2}
              label={t('common.delete')}
              destructive
              onClick={() => {
                setMenuOpen(false)
                setConfirmDelete(true)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-2">
        <Badge>{t(`schedule.${protocol.schedule.kind}`)}</Badge>
        <Badge variant="outline">
          {protocol.doseAmount} {protocol.doseUnit}
        </Badge>
        {stats.isPerpetual && <Badge variant="outline">∞ {t('protocols.perpetual')}</Badge>}
        {!protocol.isActive && <Badge variant="outline">{t('protocols.pausedBadge')}</Badge>}
        {stats.missedCount > 0 && (
          <Badge variant="destructive">{t('protocols.missedCount', { count: stats.missedCount })}</Badge>
        )}
      </div>

      {stats.nextOccurrence && (
        <button
          type="button"
          onClick={onEdit}
          className="mx-4 mt-3 flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-accent px-3 py-2 text-left"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('protocols.nextDose')}
            </p>
            <p className="text-sm font-medium text-primary">{formatDateTime(stats.nextOccurrence.scheduledAt)}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-primary" />
        </button>
      )}

      <p className="px-4 py-3 text-xs text-muted-foreground">
        {t('protocols.loggedCount', { count: stats.loggedCount })}
        {stats.upcomingCount > 0 && ` · ${t('protocols.upcomingCount', { count: stats.upcomingCount })}`}
      </p>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('protocols.deleteDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('protocols.deleteDialogDescription', { name: protocol.name || compound?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm ${
        destructive ? 'text-destructive' : 'text-foreground'
      }`}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  )
}

interface ProtocolFormProps {
  protocolId?: string
  /** Prefills a new protocol's fields from a starter template — still fully editable before saving. */
  template?: ProtocolTemplate
  onDone: () => void
}

/** Exported so Onboarding's "create your first protocol" step can reuse this exact form. */
export function ProtocolForm({ protocolId, template, onDone }: ProtocolFormProps) {
  const { t } = useTranslation()
  const existing = useLiveQuery(
    () => (protocolId ? db.protocols.get(protocolId) : undefined),
    [protocolId],
  )
  const compounds = useMemo(() => listSelectableCompounds(), [])

  const [loaded, setLoaded] = useState(!protocolId)
  const [name, setName] = useState(template ? t(template.nameKey) : '')
  const [compoundId, setCompoundId] = useState(template?.compoundId ?? compounds[0]?.id ?? '')
  const [doseAmount, setDoseAmount] = useState(
    template ? String(template.doseAmount).replace('.', ',') : '',
  )
  const [doseUnit, setDoseUnit] = useState<MassUnit | 'IU'>(template?.doseUnit ?? 'mg')
  const [scheduleKind, setScheduleKind] = useState<Schedule['kind']>(template?.schedule.kind ?? 'daily')
  const [everyN, setEveryN] = useState(
    template?.schedule.kind === 'everyNDays' ? String(template.schedule.n) : '2',
  )
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    template?.schedule.kind === 'weekdays' ? template.schedule.days : [1, 3, 5],
  )
  const [daysOn, setDaysOn] = useState(
    template?.schedule.kind === 'cycle' ? String(template.schedule.daysOn) : '5',
  )
  const [daysOff, setDaysOff] = useState(
    template?.schedule.kind === 'cycle' ? String(template.schedule.daysOff) : '2',
  )
  const [reminderTimes, setReminderTimes] = useState<string[]>(template?.reminderTimes ?? ['08:00'])
  const [startDate, setStartDate] = useState(toIsoDate(new Date()))
  const [hasEndDate, setHasEndDate] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [route, setRoute] = useState<Route>(template?.route ?? 'subcutaneous')

  if (existing && !loaded) {
    setName(existing.name)
    setCompoundId(existing.compoundId)
    setDoseAmount(String(existing.doseAmount))
    setDoseUnit(existing.doseUnit)
    setScheduleKind(existing.schedule.kind)
    if (existing.schedule.kind === 'everyNDays') setEveryN(String(existing.schedule.n))
    if (existing.schedule.kind === 'weekdays') setWeekdays(existing.schedule.days)
    if (existing.schedule.kind === 'cycle') {
      setDaysOn(String(existing.schedule.daysOn))
      setDaysOff(String(existing.schedule.daysOff))
    }
    setReminderTimes(existing.reminderTimes.length ? existing.reminderTimes : ['08:00'])
    setStartDate(existing.startDate)
    setHasEndDate(Boolean(existing.endDate))
    setEndDate(existing.endDate ?? '')
    setRoute(existing.route)
    setLoaded(true)
  }

  const compound = compounds.find((c) => c.id === compoundId)

  function scheduleFromForm(): Schedule {
    switch (scheduleKind) {
      case 'daily':
        return { kind: 'daily' }
      case 'everyNDays':
        return { kind: 'everyNDays', n: Math.max(1, Number(everyN) || 1) }
      case 'weekdays':
        return { kind: 'weekdays', days: weekdays.length ? weekdays : [1] }
      case 'cycle':
        return {
          kind: 'cycle',
          daysOn: Math.max(1, Number(daysOn) || 1),
          daysOff: Math.max(0, Number(daysOff) || 0),
        }
    }
  }

  const canSave = compound !== undefined && doseAmount.trim() !== '' && reminderTimes.length > 0

  async function handleSave() {
    if (!compound) return
    const protocol: Protocol = {
      id: protocolId ?? crypto.randomUUID(),
      name: name.trim(),
      compoundId: compound.id,
      doseAmount: Number(doseAmount.replace(',', '.')) || 0,
      doseUnit: doseUnit,
      schedule: scheduleFromForm(),
      reminderTimes,
      startDate,
      endDate: hasEndDate && endDate ? endDate : undefined,
      route,
      isActive: existing?.isActive ?? true,
    }
    await db.protocols.put(protocol)
    void rescheduleReminders()
    onDone()
  }

  function updateReminderTime(index: number, value: string) {
    setReminderTimes((times) => times.map((t, i) => (i === index ? value : t)))
  }

  function addReminderTime() {
    setReminderTimes((times) => [...times, '08:00'])
  }

  function removeReminderTime(index: number) {
    setReminderTimes((times) => times.filter((_, i) => i !== index))
  }

  function toggleWeekday(day: Weekday) {
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()))
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-4">
      <AppHeader
        title={protocolId ? t('protocols.editTitle') : t('protocols.newTitle')}
        onBack={onDone}
      />

      <FormField label={t('protocols.compound')}>
        <Select
          value={compoundId}
          onValueChange={(value) => {
            setCompoundId(value)
            const c = compounds.find((x) => x.id === value)
            if (c) setDoseUnit(c.defaultUnit)
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {compounds.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label={t('protocols.name')}>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={compound?.name}
          />
      </FormField>

      <FormField label={t('protocols.doseAmount')}>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="decimal"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            className="min-h-11 flex-1 rounded-full border border-input bg-card px-4 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {compound?.defaultUnit === 'IU' ? (
            <span className="flex min-h-11 items-center px-3 text-muted-foreground">IU</span>
          ) : (
            <div className="flex overflow-hidden rounded-full border border-border">
              {(['mg', 'mcg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setDoseUnit(u)}
                  className={`min-h-11 px-3 text-sm font-medium transition-colors ${
                    doseUnit === u ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>
      </FormField>

      <FormField label={t('protocols.schedule')}>
        <Select value={scheduleKind} onValueChange={(v) => setScheduleKind(v as Schedule['kind'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`schedule.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {scheduleKind === 'everyNDays' && (
        <FormField label={t('protocols.everyNDays')}>
          <Input
            type="number"
            min={1}
            value={everyN}
            onChange={(e) => setEveryN(e.target.value)}
              />
        </FormField>
      )}

      {scheduleKind === 'weekdays' && (
        <FormField label={t('protocols.weekdays')}>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS_KEYS.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleWeekday(index as Weekday)}
                className={`min-h-11 min-w-11 rounded-full border text-sm font-medium transition-colors ${
                  weekdays.includes(index as Weekday)
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {t(`weekday.${key}`)}
              </button>
            ))}
          </div>
        </FormField>
      )}

      {scheduleKind === 'cycle' && (
        <div className="flex gap-3">
          <FormField label={t('protocols.daysOn')}>
            <Input
              type="number"
              min={1}
              value={daysOn}
              onChange={(e) => setDaysOn(e.target.value)}
                  />
          </FormField>
          <FormField label={t('protocols.daysOff')}>
            <Input
              type="number"
              min={0}
              value={daysOff}
              onChange={(e) => setDaysOff(e.target.value)}
                  />
          </FormField>
        </div>
      )}

      <FormField label={t('protocols.reminderTimes')}>
        <div className="flex flex-col gap-2">
          {reminderTimes.map((time, index) => (
            <div key={index} className="flex items-center gap-2">
              <TimePicker value={time} onChange={(value) => updateReminderTime(index, value)} />
              {reminderTimes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeReminderTime(index)}
                  className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addReminderTime}
            className="flex min-h-11 items-center gap-1 self-start text-sm text-primary"
          >
            <Plus className="size-4" />
            {t('protocols.addReminderTime')}
          </button>
        </div>
      </FormField>

      <FormField label={t('protocols.startDate')}>
        <DatePicker value={startDate} onChange={setStartDate} />
      </FormField>

      <FormField label={t('protocols.endDate')}>
        <div className="flex items-center gap-3">
          <Switch checked={hasEndDate} onCheckedChange={setHasEndDate} />
          <div className="flex-1">
            <DatePicker value={endDate} onChange={setEndDate} disabled={!hasEndDate} />
          </div>
        </div>
      </FormField>

      <FormField label={t('protocols.route')}>
        <Select value={route} onValueChange={(v) => setRoute(v as Route)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROUTES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`route.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <Button onClick={handleSave} disabled={!canSave} className="mt-2">
        {t('common.save')}
      </Button>
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
