import { ChevronLeft, ClipboardList, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DatePicker } from '@/components/DatePicker'
import { TimePicker } from '@/components/TimePicker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '../components/EmptyState'
import { TemplatePicker } from '../components/TemplatePicker'
import { getCompoundById, listSelectableCompounds } from '../content/compounds'
import type { ProtocolTemplate } from '../content/protocolTemplates'
import { toIsoDate } from '../lib/dates'
import { db, type Protocol, type Route } from '../lib/db'
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

export function ProtocolsScreen() {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  if (mode.kind === 'picker') {
    return (
      <TemplatePicker
        onSelectTemplate={(template) => setMode({ kind: 'form', template })}
        onSelectCustom={() => setMode({ kind: 'form' })}
      />
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

  const sorted = [...(protocols ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive))

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.protocols')}</h1>
        <Button onClick={() => setMode({ kind: 'picker' })}>
          <Plus className="size-4" />
          {t('protocols.new')}
        </Button>
      </div>

      {protocols !== undefined && sorted.length === 0 && (
        <EmptyState icon={ClipboardList} title={t('protocols.emptyTitle')} body={t('protocols.emptyBody')} />
      )}

      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {sorted.map((protocol) => (
            <motion.div
              key={protocol.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
            >
              <ProtocolRow protocol={protocol} onEdit={() => setMode({ kind: 'form', protocolId: protocol.id })} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function ProtocolRow({ protocol, onEdit }: { protocol: Protocol; onEdit: () => void }) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)

  async function toggleActive() {
    await db.protocols.update(protocol.id, { isActive: !protocol.isActive })
    void rescheduleReminders()
  }

  return (
    <Card className={protocol.isActive ? undefined : 'bg-muted opacity-60 shadow-none'}>
      <div className="flex items-center justify-between gap-2 p-4">
        <button type="button" onClick={onEdit} className="min-h-11 flex-1 text-left">
          <p className="font-medium text-foreground">{protocol.name || compound?.name}</p>
          <p className="text-sm text-muted-foreground">
            {compound?.name} · {protocol.doseAmount} {protocol.doseUnit} · {t(`schedule.${protocol.schedule.kind}`)}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Switch checked={protocol.isActive} onCheckedChange={toggleActive} aria-label={t('protocols.activate')} />
        </div>
      </div>
    </Card>
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
      <div className="flex items-center justify-between">
        <button type="button" onClick={onDone} className="flex min-h-11 items-center gap-1 text-primary">
          <ChevronLeft className="size-5" />
          {t('common.cancel')}
        </button>
        <h1 className="text-lg font-semibold">
          {protocolId ? t('protocols.editTitle') : t('protocols.newTitle')}
        </h1>
        <div className="w-16" />
      </div>

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
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={compound?.name}
          className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FormField>

      <FormField label={t('protocols.doseAmount')}>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {compound?.defaultUnit === 'IU' ? (
            <span className="flex min-h-11 items-center px-3 text-muted-foreground">IU</span>
          ) : (
            <div className="flex overflow-hidden rounded-xl border border-border">
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
          <input
            type="number"
            min={1}
            value={everyN}
            onChange={(e) => setEveryN(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                className={`min-h-11 min-w-11 rounded-xl border text-sm font-medium transition-colors ${
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
            <input
              type="number"
              min={1}
              value={daysOn}
              onChange={(e) => setDaysOn(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label={t('protocols.daysOff')}>
            <input
              type="number"
              min={0}
              value={daysOff}
              onChange={(e) => setDaysOff(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
