/**
 * Validation for backup files on import. A backup is a file the user picks —
 * possibly hand-edited, truncated, or from somewhere else entirely — and what
 * it contains ends up in IndexedDB and is then fed straight into schedule
 * maths and rendering. An unchecked import could store a schedule that throws
 * on every render (bricking the app until storage is cleared), absurd values,
 * or arbitrarily large/odd strings.
 *
 * So every record is rebuilt field by field from an allow-list: unknown keys
 * are dropped, types and ranges are checked, free text is sanitized, and any
 * record that isn't valid rejects the whole file (before anything is written)
 * rather than restoring a quietly partial history.
 *
 * Format versions: 1 (Phase 1: protocols, dose logs, settings), 2 (adds
 * vials, custom compounds and user templates) and 3 (adds the store
 * compounds the user's records refer to, so a restore onto a fresh device
 * doesn't show bare ids before its first catalogue sync). All import; an
 * older file simply restores without the newer collections. Exports are
 * always the latest.
 */
import { CUSTOM_CATEGORY, type Compound } from '../content/compounds'
import type { DoseLog, Protocol, SavedReconstitution, Settings, UserTemplate, Vial } from './db'
import {
  MAX_CYCLES,
  MAX_DAY_COUNT,
  MAX_DOSE_AMOUNT,
  MAX_WEEK_COUNT,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  sanitizeMultiline,
  sanitizeText,
} from './sanitize'
import type { CycleInnerSchedule, Schedule, Weekday } from './schedule'
import { isSiteId, type SiteId } from './injectionSites'
import { MAX_TITRATION_STEPS, type Titration } from './titration'

export const BACKUP_VERSION = 3
const SUPPORTED_VERSIONS: readonly unknown[] = [1, 2, 3]
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_PROTOCOLS = 1000
const MAX_DOSE_LOGS = 200_000
const MAX_VIALS = 10_000
const MAX_CUSTOM_COMPOUNDS = 500
const MAX_STORE_COMPOUNDS = 1000
const MAX_USER_TEMPLATES = 500
const MAX_VIAL_SIZES = 20
const MAX_STORE_TEXT = 200
const MAX_ALIASES = 10
export const MAX_LOT_LENGTH = 40
const MAX_ID_LENGTH = 100
const MAX_REMINDER_TIMES = 12
const MAX_CUSTOM_DATES = 500

export interface ValidBackup {
  version: typeof BACKUP_VERSION
  exportedAt: string
  protocols: Protocol[]
  doseLogs: DoseLog[]
  settings?: Settings
  vials: Vial[]
  customCompounds: Compound[]
  storeCompounds: Compound[]
  userTemplates: UserTemplate[]
}

class InvalidBackupError extends Error {}

function fail(what: string): never {
  throw new InvalidBackupError(`Invalid backup: ${what}`)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, what: string, maxLength = MAX_ID_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) fail(what)
  return value
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(what)
  return value as T
}

function finiteNumber(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(what)
  return value
}

/** A calendar date "yyyy-MM-dd" that actually exists (no 2026-02-31). */
function isoDate(value: unknown, what: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) fail(what)
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail(what)
  return value
}

function isoDateTime(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(new Date(value).getTime())) fail(what)
  return value
}

function schedule(value: unknown): Schedule {
  if (!isRecord(value)) fail('schedule')
  switch (value.kind) {
    case 'daily':
      return { kind: 'daily' }
    case 'everyNDays': {
      const n = finiteNumber(value.n, 'schedule.n', 1, MAX_DAY_COUNT)
      if (!Number.isInteger(n)) fail('schedule.n')
      return { kind: 'everyNDays', n }
    }
    case 'weekdays': {
      if (!Array.isArray(value.days) || value.days.length === 0 || value.days.length > 7) fail('schedule.days')
      const days = value.days.map((d) => {
        if (!Number.isInteger(d) || (d as number) < 0 || (d as number) > 6) fail('schedule.days')
        return d as Weekday
      })
      return { kind: 'weekdays', days: [...new Set(days)].sort() as Weekday[] }
    }
    case 'cycle': {
      const daysOn = finiteNumber(value.daysOn, 'schedule.daysOn', 1, MAX_DAY_COUNT)
      const daysOff = finiteNumber(value.daysOff, 'schedule.daysOff', 0, MAX_DAY_COUNT)
      if (!Number.isInteger(daysOn) || !Number.isInteger(daysOff)) fail('schedule cycle')
      return { kind: 'cycle', daysOn, daysOff }
    }
    case 'custom': {
      if (!Array.isArray(value.dates) || value.dates.length === 0 || value.dates.length > MAX_CUSTOM_DATES) {
        fail('schedule.dates')
      }
      return { kind: 'custom', dates: [...new Set(value.dates.map((d) => isoDate(d, 'schedule.dates')))].sort() }
    }
    case 'cycleWeeks': {
      // Checked before parsing, so a file can't nest cycles inside cycles.
      if (!isRecord(value.inner) || !['daily', 'everyNDays', 'weekdays'].includes(String(value.inner.kind))) {
        fail('schedule.inner')
      }
      const inner = schedule(value.inner) as CycleInnerSchedule
      const result: Schedule = {
        kind: 'cycleWeeks',
        inner,
        weeksOn: wholeNumber(value.weeksOn, 'schedule.weeksOn', 1, MAX_WEEK_COUNT),
        weeksOff: wholeNumber(value.weeksOff, 'schedule.weeksOff', 0, MAX_WEEK_COUNT),
      }
      if (value.cycles !== undefined) result.cycles = wholeNumber(value.cycles, 'schedule.cycles', 1, MAX_CYCLES)
      // A washout only means something after a fixed number of cycles.
      if (value.washoutWeeks !== undefined && result.cycles !== undefined) {
        result.washoutWeeks = wholeNumber(value.washoutWeeks, 'schedule.washoutWeeks', 1, MAX_WEEK_COUNT)
      }
      return result
    }
    default:
      return fail('schedule.kind')
  }
}

function wholeNumber(value: unknown, what: string, min: number, max: number): number {
  const n = finiteNumber(value, what, min, max)
  if (!Number.isInteger(n)) fail(what)
  return n
}

/** Saved mixes are derived, convenience data: a bad one is dropped rather than failing the whole restore. */
function reconstitution(value: unknown): SavedReconstitution | undefined {
  try {
    if (!isRecord(value)) return undefined
    return {
      vialSize: finiteNumber(value.vialSize, 'vialSize', 0, 1e9),
      vialUnit: oneOf(value.vialUnit, ['mg', 'mcg', 'IU', 'mL'] as const, 'vialUnit'),
      diluentMl: value.diluentMl === undefined ? undefined : finiteNumber(value.diluentMl, 'diluentMl', 0, 1e6),
      syringeType: oneOf(value.syringeType, ['U-100', 'U-50', 'U-40'] as const, 'syringeType'),
      drawVolumeMl: finiteNumber(value.drawVolumeMl, 'drawVolumeMl', 0, 1e6),
      drawSyringeUnits: finiteNumber(value.drawSyringeUnits, 'drawSyringeUnits', 0, 1e6),
      doseAmount: finiteNumber(value.doseAmount, 'doseAmount', 0, MAX_DOSE_AMOUNT),
      doseUnit: oneOf(value.doseUnit, ['mg', 'mcg', 'IU'] as const, 'doseUnit'),
      savedAt: isoDateTime(value.savedAt, 'savedAt'),
    }
  } catch {
    return undefined
  }
}

function titration(value: unknown): Titration {
  if (!isRecord(value) || !Array.isArray(value.steps)) fail('protocol.titration')
  if (value.steps.length < 2 || value.steps.length > MAX_TITRATION_STEPS) fail('protocol.titration.steps')
  return {
    steps: value.steps.map((step) => {
      if (!isRecord(step)) fail('protocol.titration.step')
      const doseAmount = finiteNumber(step.doseAmount, 'titration.doseAmount', 0, MAX_DOSE_AMOUNT)
      if (doseAmount === 0) fail('titration.doseAmount')
      return { doseAmount, weeks: wholeNumber(step.weeks, 'titration.weeks', 1, MAX_WEEK_COUNT) }
    }),
  }
}

/**
 * Site rotation is a preference, so a malformed one is dropped rather than
 * failing the restore; unknown site ids are dropped, and none left means off.
 */
function siteTracking(value: unknown): { sites: SiteId[] } | undefined {
  if (!isRecord(value) || !Array.isArray(value.sites)) return undefined
  const sites = [...new Set(value.sites.filter(isSiteId))]
  return sites.length > 0 ? { sites } : undefined
}

function protocol(value: unknown): Protocol {
  if (!isRecord(value)) fail('protocol')
  if (!Array.isArray(value.reminderTimes) || value.reminderTimes.length === 0 || value.reminderTimes.length > MAX_REMINDER_TIMES) {
    fail('protocol.reminderTimes')
  }
  const reminderTimes = value.reminderTimes.map((t) => {
    if (typeof t !== 'string' || !HHMM.test(t)) fail('protocol.reminderTimes')
    return t
  })
  const result: Protocol = {
    id: str(value.id, 'protocol.id'),
    name: value.name === undefined ? '' : sanitizeText(String(value.name), MAX_NAME_LENGTH).trim(),
    compoundId: str(value.compoundId, 'protocol.compoundId'),
    doseAmount: finiteNumber(value.doseAmount, 'protocol.doseAmount', 0, MAX_DOSE_AMOUNT),
    doseUnit: oneOf(value.doseUnit, ['mg', 'mcg', 'IU'] as const, 'protocol.doseUnit'),
    schedule: schedule(value.schedule),
    reminderTimes,
    startDate: isoDate(value.startDate, 'protocol.startDate'),
    route: oneOf(value.route, ['subcutaneous', 'intramuscular', 'other'] as const, 'protocol.route'),
    isActive: typeof value.isActive === 'boolean' ? value.isActive : fail('protocol.isActive'),
  }
  if (value.endDate !== undefined) result.endDate = isoDate(value.endDate, 'protocol.endDate')
  if (value.trackingStartsAt !== undefined) result.trackingStartsAt = isoDateTime(value.trackingStartsAt, 'protocol.trackingStartsAt')
  const mix = reconstitution(value.reconstitution)
  if (mix) result.reconstitution = mix
  const tracking = siteTracking(value.siteTracking)
  if (tracking) result.siteTracking = tracking
  if (value.titration !== undefined) {
    result.titration = titration(value.titration)
    // The app keeps the plain dose equal to the first step (see titration.ts); a file can't break that.
    result.doseAmount = result.titration.steps[0]!.doseAmount
  }
  return result
}

function doseLog(value: unknown): DoseLog {
  if (!isRecord(value)) fail('dose log')
  const result: DoseLog = {
    id: str(value.id, 'doseLog.id'),
    compoundId: str(value.compoundId, 'doseLog.compoundId'),
    administeredAt: isoDateTime(value.administeredAt, 'doseLog.administeredAt'),
    status: oneOf(value.status, ['taken', 'skipped'] as const, 'doseLog.status'),
    // Bookkeeping stamps: fall back to the dose's own time rather than reject an otherwise good log.
    createdAt: isoDateTime(value.createdAt ?? value.administeredAt, 'doseLog.createdAt'),
    updatedAt: isoDateTime(value.updatedAt ?? value.administeredAt, 'doseLog.updatedAt'),
  }
  if (value.protocolId !== undefined) result.protocolId = str(value.protocolId, 'doseLog.protocolId')
  if (value.vialId !== undefined) result.vialId = str(value.vialId, 'doseLog.vialId')
  // An unknown site is dropped, not fatal: the dose itself is still a true record.
  if (result.status === 'taken' && isSiteId(value.site)) result.site = value.site
  if (value.doseMcg !== undefined) result.doseMcg = finiteNumber(value.doseMcg, 'doseLog.doseMcg', 0, 1e12)
  if (value.doseIU !== undefined) result.doseIU = finiteNumber(value.doseIU, 'doseLog.doseIU', 0, 1e12)
  if (typeof value.notes === 'string') {
    const notes = sanitizeMultiline(value.notes, MAX_NOTES_LENGTH).trim()
    if (notes) result.notes = notes
  }
  return result
}

/** Optional short free text (lot, batch): sanitized, and dropped rather than stored when empty. */
function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = sanitizeText(value, maxLength).trim()
  return text || undefined
}

function vial(value: unknown): Vial {
  if (!isRecord(value)) fail('vial')
  const result: Vial = {
    id: str(value.id, 'vial.id'),
    compoundId: str(value.compoundId, 'vial.compoundId'),
    openedOn: isoDate(value.openedOn, 'vial.openedOn'),
    status: oneOf(value.status, ['active', 'finished', 'discarded'] as const, 'vial.status'),
    createdAt: isoDateTime(value.createdAt ?? value.updatedAt, 'vial.createdAt'),
    updatedAt: isoDateTime(value.updatedAt ?? value.createdAt, 'vial.updatedAt'),
  }
  // Same rule as DoseLog: exactly one of the two amounts.
  const hasMcg = value.totalMcg !== undefined
  const hasIU = value.totalMilliIU !== undefined
  if (hasMcg === hasIU) fail('vial amount')
  if (hasMcg) result.totalMcg = finiteNumber(value.totalMcg, 'vial.totalMcg', 1, 1e12)
  if (hasIU) result.totalMilliIU = finiteNumber(value.totalMilliIU, 'vial.totalMilliIU', 1, 1e12)
  if (value.protocolId !== undefined) result.protocolId = str(value.protocolId, 'vial.protocolId')
  if (value.diluentMl !== undefined) result.diluentMl = finiteNumber(value.diluentMl, 'vial.diluentMl', 0, 1e6)
  if (value.expiresOn !== undefined) result.expiresOn = isoDate(value.expiresOn, 'vial.expiresOn')
  if (value.discardOn !== undefined) result.discardOn = isoDate(value.discardOn, 'vial.discardOn')
  if (value.closedAt !== undefined) result.closedAt = isoDateTime(value.closedAt, 'vial.closedAt')
  const lot = optionalText(value.lot, MAX_LOT_LENGTH)
  if (lot) result.lot = lot
  const batch = optionalText(value.batch, MAX_LOT_LENGTH)
  if (batch) result.batch = batch
  if (typeof value.notes === 'string') {
    const notes = sanitizeMultiline(value.notes, MAX_NOTES_LENGTH).trim()
    if (notes) result.notes = notes
  }
  return result
}

/** Only user-created compounds travel in a backup — the catalogue comes from the app itself. */
function customCompound(value: unknown): Compound {
  if (!isRecord(value)) fail('compound')
  const id = str(value.id, 'compound.id')
  if (!id.startsWith('custom-')) fail('compound.id')
  const name = sanitizeText(String(value.name ?? ''), MAX_NAME_LENGTH).trim()
  if (!name) fail('compound.name')
  if (!Array.isArray(value.vialSizes) || value.vialSizes.length > MAX_VIAL_SIZES) fail('compound.vialSizes')
  return {
    id,
    name,
    category: CUSTOM_CATEGORY,
    defaultUnit: oneOf(value.defaultUnit, ['mg', 'mcg', 'IU'] as const, 'compound.defaultUnit'),
    vialSizes: value.vialSizes.map((size) => finiteNumber(size, 'compound.vialSizes', 0, 1e9)),
    form: oneOf(value.form, ['powder', 'solution'] as const, 'compound.form'),
    isBlend: false,
    isDiluent: false,
    isCustom: true,
  }
}

/**
 * A store compound a record refers to, carried for its name and measure only.
 * Restored unlisted and without its store products — the next catalogue sync
 * on the restoring device is what says whether its store sells it.
 */
function storeCompound(value: unknown): Compound {
  if (!isRecord(value)) fail('store compound')
  const id = str(value.id, 'storeCompound.id')
  if (id.startsWith('custom-')) fail('storeCompound.id')
  const name = sanitizeText(String(value.name ?? ''), MAX_STORE_TEXT).trim()
  if (!name) fail('storeCompound.name')
  if (!Array.isArray(value.vialSizes) || value.vialSizes.length > MAX_VIAL_SIZES) fail('storeCompound.vialSizes')
  const result: Compound = {
    id,
    name,
    category: typeof value.category === 'string' ? sanitizeText(value.category, MAX_STORE_TEXT).trim() : '',
    defaultUnit: oneOf(value.defaultUnit, ['mg', 'mcg', 'IU'] as const, 'storeCompound.defaultUnit'),
    vialSizes: value.vialSizes.map((size) => finiteNumber(size, 'storeCompound.vialSizes', 0, 1e9)),
    form: oneOf(value.form, ['powder', 'solution'] as const, 'storeCompound.form'),
    isBlend: value.isBlend === true,
    isDiluent: value.isDiluent === true,
    source: 'store',
    listed: false,
  }
  if (Array.isArray(value.aliases)) {
    const aliases = value.aliases
      .slice(0, MAX_ALIASES)
      .map((a) => (typeof a === 'string' ? sanitizeText(a, MAX_STORE_TEXT).trim() : ''))
      .filter(Boolean)
    if (aliases.length) result.aliases = aliases
  }
  return result
}

function userTemplate(value: unknown): UserTemplate {
  if (!isRecord(value)) fail('template')
  // Same field rules as a protocol — reuse its validator on a protocol-shaped view.
  const asProtocol = protocol({ ...value, startDate: '2000-01-01', isActive: true })
  const name = sanitizeText(String(value.name ?? ''), MAX_NAME_LENGTH).trim()
  if (!name) fail('template.name')
  const result: UserTemplate = {
    id: asProtocol.id,
    name,
    compoundId: asProtocol.compoundId,
    doseAmount: asProtocol.doseAmount,
    doseUnit: asProtocol.doseUnit,
    schedule: asProtocol.schedule,
    reminderTimes: asProtocol.reminderTimes,
    route: asProtocol.route,
    createdAt: isoDateTime(value.createdAt, 'template.createdAt'),
  }
  if (asProtocol.titration) result.titration = asProtocol.titration
  if (asProtocol.siteTracking) result.siteTracking = asProtocol.siteTracking
  return result
}

/** A v2 collection: absent in a v1 file (→ empty), otherwise an array within its size limit. */
function optionalList<T>(value: unknown, max: number, parse: (item: unknown) => T, what: string): T[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > max) fail(what)
  return value.map(parse)
}

function settings(value: unknown): Settings | undefined {
  if (!isRecord(value)) return undefined
  const result: Settings = {
    id: 1,
    locale: oneOf(value.locale, ['es-CR', 'en'] as const, 'settings.locale'),
    syringeType: oneOf(value.syringeType, ['U-100', 'U-50', 'U-40'] as const, 'settings.syringeType'),
  }
  if (value.theme !== undefined) result.theme = oneOf(value.theme, ['light', 'dark', 'system'] as const, 'settings.theme')
  if (value.legalAcceptedVersion !== undefined) {
    result.legalAcceptedVersion = finiteNumber(value.legalAcceptedVersion, 'settings.legalAcceptedVersion', 0, 1e6)
  }
  for (const key of ['legalAcceptedAt', 'lastBackupAt', 'getStartedDismissedAt', 'onboardingCompletedAt'] as const) {
    if (value[key] !== undefined) result[key] = isoDateTime(value[key], `settings.${key}`)
  }
  if (typeof value.hasUsedCalculator === 'boolean') result.hasUsedCalculator = value.hasUsedCalculator
  return result
}

/**
 * Turns untrusted parsed JSON into a clean backup, or throws. Nothing is
 * written anywhere — call this before showing the "replace my data?" dialog.
 */
export function parseBackup(input: unknown): ValidBackup {
  if (!isRecord(input)) fail('not an object')
  if (!SUPPORTED_VERSIONS.includes(input.version)) fail(`unsupported version ${String(input.version)}`)
  if (!Array.isArray(input.protocols) || !Array.isArray(input.doseLogs)) fail('missing protocols or dose logs')
  if (input.protocols.length > MAX_PROTOCOLS || input.doseLogs.length > MAX_DOSE_LOGS) fail('too many records')

  const protocols = input.protocols.map(protocol)
  const doseLogs = input.doseLogs.map(doseLog)
  const vials = optionalList(input.vials, MAX_VIALS, vial, 'vials')
  const customCompounds = optionalList(input.customCompounds, MAX_CUSTOM_COMPOUNDS, customCompound, 'custom compounds')
  const storeCompounds = optionalList(input.storeCompounds, MAX_STORE_COMPOUNDS, storeCompound, 'store compounds')
  const userTemplates = optionalList(input.userTemplates, MAX_USER_TEMPLATES, userTemplate, 'templates')
  for (const list of [protocols, doseLogs, vials, customCompounds, storeCompounds, userTemplates]) {
    if (new Set(list.map((r) => r.id)).size !== list.length) fail('duplicate ids')
  }

  // A link to a vial that isn't in the file is dropped, not fatal: the dose
  // itself is still a true record, it just no longer counts against a vial.
  const vialIds = new Set(vials.map((v) => v.id))
  for (const log of doseLogs) {
    if (log.vialId !== undefined && !vialIds.has(log.vialId)) delete log.vialId
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: isoDateTime(input.exportedAt, 'exportedAt'),
    protocols,
    doseLogs,
    settings: settings(input.settings),
    vials,
    customCompounds,
    storeCompounds,
    userTemplates,
  }
}
