import Dexie, { type EntityTable } from 'dexie'
import { COMPOUNDS, type Compound } from '../content/compounds'
import type { Schedule } from './schedule'
import type { Locale, SyringeType } from './units'

export type DoseStatus = 'taken' | 'skipped'
export type Route = 'subcutaneous' | 'intramuscular' | 'other'

export interface Protocol {
  id: string
  name: string
  compoundId: string
  doseAmount: number // in doseUnit
  doseUnit: 'mg' | 'mcg' | 'IU'
  schedule: Schedule
  reminderTimes: string[] // "HH:mm", 24h, local time
  startDate: string // yyyy-MM-dd
  endDate?: string // yyyy-MM-dd
  route: Route
  isActive: boolean
}

/**
 * A logged event. Exactly one of `doseMcg` / `doseIU` is set, matching the
 * dosed compound's kind (mass vs IU) — never both, and doseIU is never
 * derived from doseMcg or vice versa (see src/lib/units.ts). Both are stored
 * at units.ts's integer storage precision: doseMcg in whole micrograms,
 * doseIU in whole milli-IU (IU × 1000).
 */
export interface DoseLog {
  id: string
  protocolId?: string // absent for an ad-hoc log not tied to a protocol
  compoundId: string
  doseMcg?: number
  doseIU?: number
  administeredAt: string // ISO datetime
  status: DoseStatus
  notes?: string
  createdAt: string // ISO datetime
  updatedAt: string // ISO datetime
}

export interface Settings {
  id: number // singleton row, always 1
  locale: Locale
  syringeType: SyringeType
  legalAcceptedVersion?: number
  legalAcceptedAt?: string // ISO datetime
  lastBackupAt?: string // ISO datetime
}

export interface Snapshot {
  id?: number // autoincrement
  createdAt: string // ISO datetime
  json: string
}

export const SETTINGS_ID = 1

class PeptidesDB extends Dexie {
  compounds!: EntityTable<Compound, 'id'>
  protocols!: EntityTable<Protocol, 'id'>
  doseLogs!: EntityTable<DoseLog, 'id'>
  settings!: EntityTable<Settings, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>

  constructor() {
    super('peptidescr')
    // Booleans aren't a valid IndexedDB key type, so isDiluent/isActive are
    // deliberately left out of these index lists (filtered in JS instead —
    // these tables are always small, so there's no performance cost).
    this.version(1).stores({
      compounds: 'id, category',
      protocols: 'id, compoundId',
      doseLogs: 'id, protocolId, compoundId, administeredAt, status',
      settings: 'id',
      snapshots: '++id, createdAt',
    })
  }
}

export const db = new PeptidesDB()

/**
 * Compounds are seeded content, not user data, but the catalogue can change
 * between app releases. Upserting on every open (instead of a one-time
 * populate hook) keeps an existing install's compound list in sync without a
 * migration step, while never touching the user's own protocols/logs.
 */
export async function ensureCompoundsSeeded(): Promise<void> {
  await db.compounds.bulkPut(COMPOUNDS)
}

export async function ensureSettingsRow(defaults: Omit<Settings, 'id'>): Promise<Settings> {
  const existing = await db.settings.get(SETTINGS_ID)
  if (existing) return existing
  const settings: Settings = { id: SETTINGS_ID, ...defaults }
  await db.settings.put(settings)
  return settings
}
