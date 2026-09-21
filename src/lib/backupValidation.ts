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
 */
import type { DoseLog, Protocol, SavedReconstitution, Settings } from './db'
import {
  MAX_DAY_COUNT,
  MAX_DOSE_AMOUNT,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  sanitizeMultiline,
  sanitizeText,
} from './sanitize'
import type { Schedule, Weekday } from './schedule'

export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const MAX_PROTOCOLS = 1000
const MAX_DOSE_LOGS = 200_000
const MAX_ID_LENGTH = 100
const MAX_REMINDER_TIMES = 12
const MAX_CUSTOM_DATES = 500

export interface ValidBackup {
  version: typeof BACKUP_VERSION
  exportedAt: string
  protocols: Protocol[]
  doseLogs: DoseLog[]
  settings?: Settings
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
    default:
      return fail('schedule.kind')
  }
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
  if (value.doseMcg !== undefined) result.doseMcg = finiteNumber(value.doseMcg, 'doseLog.doseMcg', 0, 1e12)
  if (value.doseIU !== undefined) result.doseIU = finiteNumber(value.doseIU, 'doseLog.doseIU', 0, 1e12)
  if (typeof value.notes === 'string') {
    const notes = sanitizeMultiline(value.notes, MAX_NOTES_LENGTH).trim()
    if (notes) result.notes = notes
  }
  return result
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
  if (input.version !== BACKUP_VERSION) fail(`unsupported version ${String(input.version)}`)
  if (!Array.isArray(input.protocols) || !Array.isArray(input.doseLogs)) fail('missing protocols or dose logs')
  if (input.protocols.length > MAX_PROTOCOLS || input.doseLogs.length > MAX_DOSE_LOGS) fail('too many records')

  const protocols = input.protocols.map(protocol)
  const doseLogs = input.doseLogs.map(doseLog)
  for (const list of [protocols, doseLogs]) {
    if (new Set(list.map((r) => r.id)).size !== list.length) fail('duplicate ids')
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: isoDateTime(input.exportedAt, 'exportedAt'),
    protocols,
    doseLogs,
    settings: settings(input.settings),
  }
}
