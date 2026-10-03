import {
  ChevronRight,
  ClipboardList,
  FlaskConical,
  type LucideIcon,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { parseISO, startOfToday } from 'date-fns'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { enUS, es } from 'react-day-picker/locale'
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
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { NumericInput } from '@/components/ui/numeric-input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Segmented } from '@/components/ui/segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '../components/EmptyState'
import { AppHeader } from '../components/AppHeader'
import { ProtocolSavedPrompt } from '../components/ProtocolSavedPrompt'
import { CustomCompoundSheet } from '../components/CustomCompoundSheet'
import { SyringeGraphic } from '../components/SyringeGraphic'
import { TemplatePicker } from '../components/TemplatePicker'
import { VialStrip } from '../components/VialStrip'
import { compareAlphabetical, getCompoundById } from '../content/compounds'
import { toCompoundOptions, useSelectableCompounds } from '../lib/customCompounds'
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from '../content/protocolTemplates'
import { formatDateTime, toIsoDate } from '../lib/dates'
import { db, type DoseLog, type Protocol, type Route, type Vial } from '../lib/db'
import { computeAdherence, computeProtocolStats } from '../lib/homeData'
import { scheduleUpcomingReminders } from '../lib/notifications'
import { alphabeticalOptions } from '../lib/options'
import { requestPushSync } from '../lib/push'
import {
  MAX_CYCLES,
  MAX_DAY_COUNT,
  MAX_NAME_LENGTH,
  MAX_WEEK_COUNT,
  parsePositiveAmount,
  sanitizeText,
} from '../lib/sanitize'
import { cyclePhase, type CycleInnerSchedule, type Schedule, type Weekday } from '../lib/schedule'
import { parseScheduleFields, scheduleFields, type ScheduleFields } from '../lib/scheduleForm'
import { cyclePhaseText } from '../lib/cycleText'
import { useLiveQuery } from '../lib/useLiveQuery'
import { formatDecimal, type Locale, type MassUnit } from '../lib/units'

/** Reminder scheduling (best-effort, Chromium-only — see notifications.ts) needs to pick
 * up new/changed/deactivated protocols right away, not just on the next app open. */
async function rescheduleReminders(): Promise<void> {
  const protocols = await db.protocols.toArray()
  await scheduleUpcomingReminders(protocols)
  requestPushSync()
}

const WEEKDAY_LABELS_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const SCHEDULE_KINDS: Schedule['kind'][] = ['daily', 'everyNDays', 'weekdays', 'cycle', 'cycleWeeks', 'custom']
const CYCLE_INNER_KINDS: CycleInnerSchedule['kind'][] = ['daily', 'everyNDays', 'weekdays']
const ROUTES: Route[] = ['subcutaneous', 'intramuscular', 'other']

type Mode =
  | { kind: 'list' }
  | { kind: 'picker' }
  | { kind: 'form'; protocolId?: string; template?: ProtocolTemplate; compoundId?: string }

/** Mirrors the "My Protocols / Templates" tabs pattern from reference peptide-tracker
 * apps — templates are browsable any time, not just at the moment of creation. */
type ListTab = 'mine' | 'templates'

interface ProtocolsScreenProps {
  /** Opens the calculator for a protocol — the "next step" offered right after saving a new one. */
  onReconstitute: (protocolId: string) => void
  /** Open straight into a new-protocol form for this compound (from the calculator's "create a protocol"). */
  initialCompoundId?: string
  /** Open straight into an existing protocol's edit form (tapping it from Home). */
  initialProtocolId?: string
}

export function ProtocolsScreen({ onReconstitute, initialCompoundId, initialProtocolId }: ProtocolsScreenProps) {
  const { t } = useTranslation()
  const protocols = useLiveQuery(() => db.protocols.toArray(), [])
  const doseLogs = useLiveQuery(() => db.doseLogs.toArray(), [])
  const vials = useLiveQuery(() => db.vials.toArray(), [])
  const [mode, setMode] = useState<Mode>(
    initialProtocolId
      ? { kind: 'form', protocolId: initialProtocolId }
      : initialCompoundId
        ? { kind: 'form', compoundId: initialCompoundId }
        : { kind: 'list' },
  )
  const [listTab, setListTab] = useState<ListTab>('mine')

  if (mode.kind === 'picker') {
    return (
      <div className="flex flex-col gap-6 px-4 pb-6 pt-2">
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
        initialCompoundId={mode.compoundId}
        onDone={() => setMode({ kind: 'list' })}
        onReconstitute={onReconstitute}
      />
    )
  }

  const all = protocols ?? []
  const activeProtocols = all.filter((p) => p.isActive)
  const pausedProtocols = all.filter((p) => !p.isActive)

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-2">
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

      <Segmented
        value={listTab}
        onChange={setListTab}
        options={[
          { value: 'mine', label: t('protocols.tabMine') },
          { value: 'templates', label: t('protocols.tabTemplates') },
        ]}
      />

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
                <h2 className="text-sm font-semibold text-muted-foreground">
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
                        vials={vials ?? []}
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
  vials,
  onEdit,
}: {
  protocol: Protocol
  doseLogs: DoseLog[]
  vials: Vial[]
  onEdit: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const compound = getCompoundById(protocol.compoundId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const stats = useMemo(() => computeProtocolStats(protocol, doseLogs, new Date()), [protocol, doseLogs])
  const adherence = useMemo(() => computeAdherence(protocol, doseLogs, new Date()), [protocol, doseLogs])
  const phase = protocol.isActive ? cyclePhase(protocol, new Date()) : null

  async function toggleActive() {
    setMenuOpen(false)
    // Resuming restarts tracking from now: the days it spent paused weren't
    // missed doses, so they must not reappear as a backlog on Home.
    await db.protocols.update(protocol.id, {
      isActive: !protocol.isActive,
      ...(protocol.isActive ? {} : { trackingStartsAt: new Date().toISOString() }),
    })
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
    <Card className={protocol.isActive ? undefined : 'bg-muted opacity-70'}>
      <div className="flex items-start justify-between gap-2 p-4 pb-0">
        <button type="button" onClick={onEdit} className="min-h-11 flex-1 text-left">
          <p className="text-base font-semibold leading-tight text-foreground">{protocol.name || compound?.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{compound?.name}</p>
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

      {/* What it is, in one line. Badges are reserved for the exceptions — a
          paused or overdue protocol — so they still mean something when they
          appear; "ongoing" is the default and no longer needs saying. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 pt-1 text-sm text-foreground">
        <span>
          {protocol.schedule.kind === 'cycleWeeks'
            ? t('cycle.summary', { on: protocol.schedule.weeksOn, off: protocol.schedule.weeksOff })
            : t(`schedule.${protocol.schedule.kind}`)}{' '}
          · <span className="whitespace-nowrap">{protocol.doseAmount} {protocol.doseUnit}</span>
        </span>
        {!protocol.isActive && <Badge variant="outline">{t('protocols.pausedBadge')}</Badge>}
        {stats.missedCount > 0 && (
          <Badge variant="destructive">{t('protocols.missedCount', { count: stats.missedCount })}</Badge>
        )}
      </div>
      {phase && (
        <p className={`px-4 pt-1 text-xs ${phase.phase === 'on' ? 'text-primary' : 'text-muted-foreground'}`}>
          {cyclePhaseText(phase, t)}
        </p>
      )}
      {adherence.percent !== null && (
        <p className="px-4 pt-1 text-xs text-muted-foreground">
          {t('adherence.protocol', { percent: adherence.percent })}
          <span className="sr-only">
            {' '}
            ({t('adherence.detail', { taken: adherence.taken, skipped: adherence.skipped, missed: adherence.missed })})
          </span>
        </p>
      )}

      {protocol.reconstitution && (
        <div className="mx-4 mt-3 flex flex-col gap-2 rounded-2xl bg-accent px-3 py-2 text-sm text-foreground">
          <p className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
          {protocol.reconstitution.diluentMl === undefined
            ? t('protocols.mixSummarySolution', {
                units: formatDecimal(protocol.reconstitution.drawSyringeUnits, locale, 1),
                ml: formatDecimal(protocol.reconstitution.drawVolumeMl, locale, 3),
                dose: `${formatDecimal(protocol.reconstitution.doseAmount, locale, 3)} ${protocol.reconstitution.doseUnit}`,
              })
            : t('protocols.mixSummary', {
                water: formatDecimal(protocol.reconstitution.diluentMl, locale, 2),
                units: formatDecimal(protocol.reconstitution.drawSyringeUnits, locale, 1),
                ml: formatDecimal(protocol.reconstitution.drawVolumeMl, locale, 3),
                dose: `${formatDecimal(protocol.reconstitution.doseAmount, locale, 3)} ${protocol.reconstitution.doseUnit}`,
              })}
          </p>
          <SyringeGraphic
            drawUnits={protocol.reconstitution.drawSyringeUnits}
            syringeType={protocol.reconstitution.syringeType}
          />
        </div>
      )}

      <VialStrip protocol={protocol} vials={vials} doseLogs={doseLogs} />

      {/* Footer: when it's next due, and how much is on record. One hairline
          instead of a nested tinted tile. */}
      <div className="mt-3 border-t border-border">
        {stats.nextOccurrence ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
          >
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{t('protocols.nextDose')}</span>
              <span className="block text-sm font-semibold text-foreground">
                {formatDateTime(stats.nextOccurrence.scheduledAt)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {t('protocols.loggedCount', { count: stats.loggedCount })}
              <ChevronRight className="size-4" />
            </span>
          </button>
        ) : (
          <p className="flex min-h-12 items-center px-4 text-xs text-muted-foreground">
            {t('protocols.loggedCount', { count: stats.loggedCount })}
          </p>
        )}
      </div>

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
  /** Preselects the compound on a new protocol (the calculator's "create a protocol" shortcut). */
  initialCompoundId?: string
  onDone: () => void
  /**
   * Where the header's back button goes. Defaults to `onDone` — fine for the
   * real Protocols screen, where "cancel" and "saved" both just return to the
   * list. Onboarding passes a distinct value: cancelling out of protocol
   * creation there needs to return to the template picker, not finish the
   * entire wizard (which is what `onDone` means in that context).
   */
  onCancel?: () => void
  /**
   * When provided, saving a NEW protocol shows the "next step: reconstitute"
   * offer instead of returning straight away. Editing an existing protocol
   * never shows it — that person already made their way through it once.
   */
  onReconstitute?: (protocolId: string) => void
}

/** Exported so Onboarding's "create your first protocol" step can reuse this exact form. */
export function ProtocolForm({
  protocolId,
  template,
  initialCompoundId,
  onDone,
  onCancel,
  onReconstitute,
}: ProtocolFormProps) {
  const { t, i18n } = useTranslation()
  const existing = useLiveQuery(
    () => (protocolId ? db.protocols.get(protocolId) : undefined),
    [protocolId],
  )
  const compounds = useSelectableCompounds()
  const [addingCompound, setAddingCompound] = useState(false)

  const compoundOptions = useMemo(() => toCompoundOptions(compounds, t), [compounds, t])
  const scheduleOptions = useMemo(() => alphabeticalOptions(SCHEDULE_KINDS, (k) => t(`schedule.${k}`)), [t])
  const routeOptions = useMemo(() => alphabeticalOptions(ROUTES, (r) => t(`route.${r}`)), [t])
  // Free-text field with suggestions: template and compound names are the
  // things people actually call a protocol, so they're offered, not required.
  const nameOptions = useMemo(() => {
    const names = new Set<string>([...PROTOCOL_TEMPLATES.map((tpl) => t(tpl.nameKey)), ...compounds.map((c) => c.name)])
    return [...names].sort(compareAlphabetical).map((n) => ({ value: n, label: n }))
  }, [t, compounds])

  const initialCompound = compounds.find((c) => c.id === (template?.compoundId ?? initialCompoundId))

  const [loaded, setLoaded] = useState(!protocolId)
  const [saved, setSaved] = useState<Protocol | null>(null)
  const [name, setName] = useState(template ? t(template.nameKey) : '')
  const [compoundId, setCompoundId] = useState(initialCompound?.id ?? compounds[0]?.id ?? '')
  const [doseAmount, setDoseAmount] = useState(
    template ? String(template.doseAmount).replace('.', ',') : '',
  )
  const [doseUnit, setDoseUnit] = useState<MassUnit | 'IU'>(
    template?.doseUnit ?? initialCompound?.defaultUnit ?? 'mg',
  )
  const [fields, setFields] = useState<ScheduleFields>(() => scheduleFields(template?.schedule))
  const setField = <K extends keyof ScheduleFields>(key: K, value: ScheduleFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }))
  const scheduleKind = fields.kind
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
    setFields(scheduleFields(existing.schedule))
    setReminderTimes(existing.reminderTimes.length ? existing.reminderTimes : ['08:00'])
    setStartDate(existing.startDate)
    setHasEndDate(Boolean(existing.endDate))
    setEndDate(existing.endDate ?? '')
    setRoute(existing.route)
    setLoaded(true)
  }

  // getCompoundById (the live registry), not `compounds`: a compound created
  // a moment ago via "Add your own" isn't in this render's list yet.
  const compound = getCompoundById(compoundId)

  function selectCompound(id: string) {
    setCompoundId(id)
    const c = getCompoundById(id)
    if (c) setDoseUnit(c.defaultUnit)
  }

  // Parsed, range-checked values. Save stays disabled until each field that
  // applies is valid — bad input is refused, never quietly turned into a default.
  const doseValue = parsePositiveAmount(doseAmount)
  const parsed = parseScheduleFields(fields)
  const schedule = parsed.schedule
  const showsEveryN = scheduleKind === 'everyNDays' || (scheduleKind === 'cycleWeeks' && fields.cycleInner === 'everyNDays')
  const showsWeekdays = scheduleKind === 'weekdays' || (scheduleKind === 'cycleWeeks' && fields.cycleInner === 'weekdays')

  const needsCustomDays = scheduleKind === 'custom' && fields.customDates.length === 0
  const canSave =
    compound !== undefined &&
    doseValue !== null &&
    reminderTimes.length > 0 &&
    !needsCustomDays &&
    schedule !== null

  async function handleSave() {
    if (!compound || doseValue === null || schedule === null) return
    // A hand-picked schedule has no meaningful start/end of its own — its
    // first and last picked days are the start and end, which also keeps
    // "ongoing" and "next dose" logic elsewhere honest without special cases.
    const customDays = schedule.kind === 'custom' ? schedule.dates : null
    const effectiveStart = customDays ? customDays[0]! : startDate
    const effectiveEnd = customDays ? customDays[customDays.length - 1] : hasEndDate && endDate ? endDate : undefined

    // Doses whose time has already passed by the moment of saving were never
    // "missed" — the app didn't know about them yet. Restart tracking from
    // now whenever the schedule itself changes; leave it alone for edits to
    // things like the name or dose so an unrelated tweak can't quietly erase
    // a genuinely missed dose.
    const scheduleUnchanged =
      existing !== undefined &&
      JSON.stringify([schedule, reminderTimes, effectiveStart, effectiveEnd]) ===
        JSON.stringify([existing.schedule, existing.reminderTimes, existing.startDate, existing.endDate])

    const protocol: Protocol = {
      id: protocolId ?? crypto.randomUUID(),
      name: sanitizeText(name).trim(),
      compoundId: compound.id,
      doseAmount: doseValue,
      doseUnit: doseUnit,
      schedule,
      reminderTimes,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      route,
      isActive: existing?.isActive ?? true,
      trackingStartsAt: scheduleUnchanged ? existing?.trackingStartsAt : new Date().toISOString(),
      // A saved mix is for one specific compound; carrying it across a change
      // of compound would show the wrong draw volume.
      reconstitution: existing?.compoundId === compound.id ? existing.reconstitution : undefined,
    }
    await db.protocols.put(protocol)
    void rescheduleReminders()
    if (!protocolId && onReconstitute) {
      setSaved(protocol)
    } else {
      onDone()
    }
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
    const days = fields.weekdays
    setField('weekdays', days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort())
  }

  if (saved && onReconstitute) {
    return (
      <ProtocolSavedPrompt
        protocol={saved}
        onReconstitute={() => onReconstitute(saved.id)}
        onSkip={onDone}
      />
    )
  }

  const selectedCustomDates = fields.customDates.map((d) => parseISO(d))
  const today = startOfToday()

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-2">
      <AppHeader
        title={protocolId ? t('protocols.editTitle') : t('protocols.newTitle')}
        onBack={onCancel ?? onDone}
      />

      <FormField label={t('protocols.compound')}>
        <Combobox
          value={compoundId}
          onValueChange={selectCompound}
          options={compoundOptions}
          emptyText={t('common.noMatches')}
          footerAction={{ label: t('compounds.addCustom'), onSelect: () => setAddingCompound(true) }}
        />
        <CustomCompoundSheet
          open={addingCompound}
          onOpenChange={setAddingCompound}
          onSaved={(c) => selectCompound(c.id)}
        />
      </FormField>

      <FormField label={t('protocols.name')}>
        <Combobox
          value={name}
          onValueChange={(v) => setName(sanitizeText(v))}
          options={nameOptions}
          allowCustom
          maxLength={MAX_NAME_LENGTH}
          placeholder={compound?.name}
          emptyText={t('common.noMatches')}
        />
      </FormField>

      <FormField label={t('protocols.doseAmount')}>
        <div className="flex gap-2">
          <NumericInput
            kind="decimal"
            value={doseAmount}
            onValueChange={setDoseAmount}
            aria-invalid={doseAmount !== '' && doseValue === null}
            className="min-h-11 flex-1 rounded-full border border-input bg-card px-4 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {compound?.defaultUnit === 'IU' ? (
            <span className="flex min-h-11 items-center px-3 text-muted-foreground">IU</span>
          ) : (
            <Segmented
              ariaLabel="mg / mcg"
              className="w-36 shrink-0"
              value={doseUnit}
              onChange={setDoseUnit}
              options={[
                { value: 'mg', label: 'mg' },
                { value: 'mcg', label: 'mcg' },
              ]}
            />
          )}
        </div>
      </FormField>

      <FormField label={t('protocols.schedule')}>
        <Select value={scheduleKind} onValueChange={(v) => setField('kind', v as Schedule['kind'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scheduleOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* A weeks cycle runs one of the plain patterns while it's on: pick
          which, then the same every-N / weekday fields below serve both. */}
      {scheduleKind === 'cycleWeeks' && (
        <FormField label={t('protocols.cycleDoseOn')}>
          <Select value={fields.cycleInner} onValueChange={(v) => setField('cycleInner', v as CycleInnerSchedule['kind'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CYCLE_INNER_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`schedule.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {showsEveryN && (
        <FormField label={t('protocols.everyNDays')}>
          <NumericInput
            kind="integer"
            value={fields.everyN}
            onValueChange={(v) => setField('everyN', v)}
            aria-invalid={parsed.everyN === null}
          />
          {parsed.everyN === null && <FieldError>{t('protocols.invalidDays', { max: MAX_DAY_COUNT })}</FieldError>}
        </FormField>
      )}

      {showsWeekdays && (
        <FormField label={t('protocols.weekdays')}>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS_KEYS.map((key, index) => (
              <button
                key={key}
                type="button"
                aria-pressed={fields.weekdays.includes(index as Weekday)}
                onClick={() => toggleWeekday(index as Weekday)}
                className={`min-h-11 min-w-11 rounded-full border text-sm font-medium transition-colors ${
                  fields.weekdays.includes(index as Weekday)
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
        <div className="flex items-end gap-3">
          <FormField label={t('protocols.daysOn')}>
            <NumericInput
              kind="integer"
              value={fields.daysOn}
              onValueChange={(v) => setField('daysOn', v)}
              aria-invalid={parsed.daysOn === null}
            />
          </FormField>
          <FormField label={t('protocols.daysOff')}>
            <NumericInput
              kind="integer"
              value={fields.daysOff}
              onValueChange={(v) => setField('daysOff', v)}
              aria-invalid={parsed.daysOff === null}
            />
          </FormField>
        </div>
      )}

      {scheduleKind === 'cycleWeeks' && (
        <>
          {/* items-end: a label that wraps (Spanish "Semanas de descanso") must not push its input out of line. */}
          <div className="flex items-end gap-3">
            <FormField label={t('protocols.weeksOn')}>
              <NumericInput
                kind="integer"
                value={fields.weeksOn}
                onValueChange={(v) => setField('weeksOn', v)}
                aria-invalid={parsed.weeksOn === null}
              />
            </FormField>
            <FormField label={t('protocols.weeksOff')}>
              <NumericInput
                kind="integer"
                value={fields.weeksOff}
                onValueChange={(v) => setField('weeksOff', v)}
                aria-invalid={parsed.weeksOff === null}
              />
            </FormField>
          </div>
          {(parsed.weeksOn === null || parsed.weeksOff === null) && (
            <FieldError>{t('protocols.invalidWeeks', { max: MAX_WEEK_COUNT })}</FieldError>
          )}
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t('protocols.fixedCycles')}</span>
            <Switch checked={fields.fixedCycles} onCheckedChange={(v) => setField('fixedCycles', v)} />
          </label>
          {fields.fixedCycles && (
            <>
              <FormField label={t('protocols.cycleCount')}>
                <NumericInput
                  kind="integer"
                  value={fields.cycleCount}
                  onValueChange={(v) => setField('cycleCount', v)}
                  aria-invalid={parsed.cycles === null}
                />
                {parsed.cycles === null && <FieldError>{t('protocols.invalidCycles', { max: MAX_CYCLES })}</FieldError>}
              </FormField>
              <FormField label={t('protocols.washoutWeeks')}>
                <NumericInput
                  kind="integer"
                  value={fields.washoutWeeks}
                  onValueChange={(v) => setField('washoutWeeks', v)}
                  aria-invalid={parsed.washoutWeeks === null}
                />
                {parsed.washoutWeeks === null && (
                  <FieldError>{t('protocols.invalidWeeks', { max: MAX_WEEK_COUNT })}</FieldError>
                )}
              </FormField>
            </>
          )}
        </>
      )}

      {scheduleKind === 'custom' && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t('protocols.customDays')}</span>
          <p className="text-sm text-muted-foreground">{t('protocols.customDaysHint')}</p>
          <div className="relative rounded-2xl border border-border bg-card p-2">
            <Calendar
              mode="multiple"
              selected={selectedCustomDates}
              onSelect={(dates) => setField('customDates', (dates ?? []).map(toIsoDate).sort())}
              locale={i18n.language === 'en' ? enUS : es}
              // Past days can't be newly picked (they'd instantly read as
              // missed), but a day already in an edited protocol stays
              // deselectable.
              disabled={(date) => date < today && !fields.customDates.includes(toIsoDate(date))}
              classNames={{
                month_grid: 'w-full border-collapse mt-2',
                weekday: 'flex-1 text-muted-foreground text-xs font-medium text-center',
                day: 'relative h-11 flex-1 p-0 text-center text-sm',
                day_button:
                  'inline-flex size-full items-center justify-center rounded-lg text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              }}
            />
          </div>
          <p className={`text-sm ${needsCustomDays ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">
            {needsCustomDays
              ? t('protocols.customDaysRequired')
              : t('protocols.customDaysCount', { count: fields.customDates.length })}
          </p>
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

      {scheduleKind !== 'custom' && (
        <>
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
        </>
      )}

      <FormField label={t('protocols.route')}>
        <Select value={route} onValueChange={(v) => setRoute(v as Route)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {routeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
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

function FieldError({ children }: { children: ReactNode }) {
  return (
    <span role="alert" className="text-sm text-destructive">
      {children}
    </span>
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
