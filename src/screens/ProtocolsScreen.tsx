import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { getCompoundById, listSelectableCompounds } from '../content/compounds'
import { toIsoDate } from '../lib/dates'
import { db, type Protocol, type Route } from '../lib/db'
import type { Schedule, Weekday } from '../lib/schedule'
import { useLiveQuery } from '../lib/useLiveQuery'
import type { MassUnit } from '../lib/units'

const WEEKDAY_LABELS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const SCHEDULE_KINDS: Schedule['kind'][] = ['daily', 'everyNDays', 'weekdays', 'cycle']
const ROUTES: Route[] = ['subcutaneous', 'intramuscular', 'other']

export function ProtocolsScreen() {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  if (editingId !== null) {
    return (
      <ProtocolForm
        protocolId={editingId === 'new' ? undefined : editingId}
        onDone={() => setEditingId(null)}
      />
    )
  }

  const sorted = [...(protocols ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive))

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('nav.protocols')}</h1>
        <Button onClick={() => setEditingId('new')}>{t('protocols.new')}</Button>
      </div>

      {protocols !== undefined && sorted.length === 0 && (
        <EmptyState title={t('protocols.emptyTitle')} body={t('protocols.emptyBody')} />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((protocol) => (
          <ProtocolRow key={protocol.id} protocol={protocol} onEdit={() => setEditingId(protocol.id)} />
        ))}
      </div>
    </div>
  )
}

function ProtocolRow({ protocol, onEdit }: { protocol: Protocol; onEdit: () => void }) {
  const { t } = useTranslation()
  const compound = getCompoundById(protocol.compoundId)

  async function toggleActive() {
    await db.protocols.update(protocol.id, { isActive: !protocol.isActive })
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        protocol.isActive ? 'border-brand-border bg-brand-surface' : 'border-brand-border bg-brand-surface-2 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onEdit} className="min-h-11 flex-1 text-left">
          <p className="font-medium text-brand-ink">{protocol.name || compound?.name}</p>
          <p className="text-sm text-brand-muted">
            {compound?.name} · {protocol.doseAmount} {protocol.doseUnit} · {t(`schedule.${protocol.schedule.kind}`)}
          </p>
        </button>
        <button
          type="button"
          onClick={toggleActive}
          className="min-h-11 shrink-0 rounded-full border border-brand-border px-3 text-xs font-medium text-brand-muted"
        >
          {protocol.isActive ? t('protocols.deactivate') : t('protocols.activate')}
        </button>
      </div>
    </div>
  )
}

interface ProtocolFormProps {
  protocolId?: string
  onDone: () => void
}

function ProtocolForm({ protocolId, onDone }: ProtocolFormProps) {
  const { t } = useTranslation()
  const existing = useLiveQuery(
    () => (protocolId ? db.protocols.get(protocolId) : undefined),
    [protocolId],
  )
  const compounds = useMemo(() => listSelectableCompounds(), [])

  const [loaded, setLoaded] = useState(!protocolId)
  const [name, setName] = useState('')
  const [compoundId, setCompoundId] = useState(compounds[0]?.id ?? '')
  const [doseAmount, setDoseAmount] = useState('')
  const [doseUnit, setDoseUnit] = useState<MassUnit | 'IU'>('mg')
  const [scheduleKind, setScheduleKind] = useState<Schedule['kind']>('daily')
  const [everyN, setEveryN] = useState('2')
  const [weekdays, setWeekdays] = useState<Weekday[]>([1, 3, 5])
  const [daysOn, setDaysOn] = useState('5')
  const [daysOff, setDaysOff] = useState('2')
  const [reminderTimes, setReminderTimes] = useState<string[]>(['08:00'])
  const [startDate, setStartDate] = useState(toIsoDate(new Date()))
  const [hasEndDate, setHasEndDate] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [route, setRoute] = useState<Route>('subcutaneous')

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
        <button type="button" onClick={onDone} className="min-h-11 text-brand-primary">
          {t('common.cancel')}
        </button>
        <h1 className="text-lg font-semibold">
          {protocolId ? t('protocols.editTitle') : t('protocols.newTitle')}
        </h1>
        <div className="w-16" />
      </div>

      <FormField label={t('protocols.compound')}>
        <select
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
          value={compoundId}
          onChange={(e) => {
            setCompoundId(e.target.value)
            const c = compounds.find((x) => x.id === e.target.value)
            if (c) setDoseUnit(c.defaultUnit)
          }}
        >
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label={t('protocols.name')}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={compound?.name}
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
        />
      </FormField>

      <FormField label={t('protocols.doseAmount')}>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-brand-border bg-brand-surface px-3"
          />
          {compound?.defaultUnit === 'IU' ? (
            <span className="flex min-h-11 items-center px-3 text-brand-muted">IU</span>
          ) : (
            <div className="flex overflow-hidden rounded-xl border border-brand-border">
              {(['mg', 'mcg'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setDoseUnit(u)}
                  className={`min-h-11 px-3 text-sm font-medium ${
                    doseUnit === u ? 'bg-brand-primary text-white' : 'bg-brand-surface text-brand-muted'
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
        <select
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
          value={scheduleKind}
          onChange={(e) => setScheduleKind(e.target.value as Schedule['kind'])}
        >
          {SCHEDULE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`schedule.${kind}`)}
            </option>
          ))}
        </select>
      </FormField>

      {scheduleKind === 'everyNDays' && (
        <FormField label={t('protocols.everyNDays')}>
          <input
            type="number"
            min={1}
            value={everyN}
            onChange={(e) => setEveryN(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
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
                className={`min-h-11 min-w-11 rounded-xl border text-sm font-medium ${
                  weekdays.includes(index as Weekday)
                    ? 'border-brand-primary bg-brand-primary-lt text-brand-primary'
                    : 'border-brand-border text-brand-muted'
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
              className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
            />
          </FormField>
          <FormField label={t('protocols.daysOff')}>
            <input
              type="number"
              min={0}
              value={daysOff}
              onChange={(e) => setDaysOff(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
            />
          </FormField>
        </div>
      )}

      <FormField label={t('protocols.reminderTimes')}>
        <div className="flex flex-col gap-2">
          {reminderTimes.map((time, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => updateReminderTime(index, e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-brand-border bg-brand-surface px-3"
              />
              {reminderTimes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeReminderTime(index)}
                  className="min-h-11 px-2 text-brand-muted"
                  aria-label={t('common.delete')}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addReminderTime} className="min-h-11 self-start text-sm text-brand-primary">
            {t('protocols.addReminderTime')}
          </button>
        </div>
      </FormField>

      <FormField label={t('protocols.startDate')}>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
        />
      </FormField>

      <FormField label={t('protocols.endDate')}>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={hasEndDate}
            onChange={(e) => setHasEndDate(e.target.checked)}
            className="h-5 w-5"
          />
          <input
            type="date"
            disabled={!hasEndDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-brand-border bg-brand-surface px-3 disabled:opacity-40"
          />
        </div>
      </FormField>

      <FormField label={t('protocols.route')}>
        <select
          className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface px-3"
          value={route}
          onChange={(e) => setRoute(e.target.value as Route)}
        >
          {ROUTES.map((r) => (
            <option key={r} value={r}>
              {t(`route.${r}`)}
            </option>
          ))}
        </select>
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
      <span className="text-sm font-medium text-brand-ink">{label}</span>
      {children}
    </label>
  )
}
