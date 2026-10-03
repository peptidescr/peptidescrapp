import Dexie, { type EntityTable } from 'dexie'
import { COMPOUNDS, type Compound } from '../content/compounds'
import type { Schedule } from './schedule'
import type { SiteId } from './injectionSites'
import type { CheckIn, SymptomPrefs, WeightEntry, WeightUnit } from './results'
import type { Titration } from './titration'
import type { Locale, SyringeType, ThemeMode } from './units'

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
  /**
   * ISO datetime; see `ScheduleContext.trackingStartsAt`. Optional (and not
   * indexed) so no Dexie version bump is needed — protocols saved before this
   * existed simply have none and behave exactly as they did.
   */
  trackingStartsAt?: string
  /** The last mixing-calculator result the user saved to this protocol. */
  reconstitution?: SavedReconstitution
  /**
   * Stepped doses (see src/lib/titration.ts). When present, `doseAmount` is
   * kept equal to the first step; ask `doseOn(protocol, day)` for the dose on
   * a given day. Optional and unindexed — no Dexie bump.
   */
  titration?: Titration
  /**
   * Injection-site rotation, when the protocol opts in (see
   * src/lib/injectionSites.ts): the sites it rotates through. Absent = not
   * tracked, and logging a dose never asks.
   */
  siteTracking?: { sites: SiteId[] }
}

/**
 * A mixing-calculator result saved onto a protocol, stored as the numbers the
 * user actually acts on (how much water, where to draw) rather than the raw
 * calculator inputs, so it can be shown back as-is without re-running the math.
 */
export interface SavedReconstitution {
  vialSize: number
  vialUnit: 'mg' | 'mcg' | 'IU' | 'mL'
  /** Diluent added, in mL. Absent for ready-to-use solutions, which aren't reconstituted. */
  diluentMl?: number
  syringeType: SyringeType
  /** Draw volume, in mL. */
  drawVolumeMl: number
  drawSyringeUnits: number
  /**
   * The dose this mix was worked out for. Kept because the calculator's
   * dose isn't forced to equal the protocol's, and a draw volume shown without
   * the dose it delivers would be easy to misread.
   */
  doseAmount: number
  doseUnit: 'mg' | 'mcg' | 'IU'
  savedAt: string // ISO datetime
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
  /**
   * The vial this dose came out of, when one was being tracked (see Vial).
   * Only `taken` logs draw anything down; a skipped log keeps whatever vial
   * was active purely as a record. Optional and unindexed, so logs from
   * before vial tracking existed are simply unlinked.
   */
  vialId?: string
  /** Where a taken dose went, when its protocol tracks injection sites. */
  site?: SiteId
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
  /**
   * Home's get-started checklist derives every other step from real data
   * (a protocol exists, a dose is logged, a backup has run). Using a
   * calculator deliberately leaves no trace — it computes, it doesn't record
   * — so that one step is the only part of the checklist that needs a flag.
   */
  hasUsedCalculator?: boolean
  /** Set when the user dismisses the checklist, so it stays dismissed. */
  getStartedDismissedAt?: string // ISO datetime
  /**
   * Set once, the moment the onboarding wizard truly finishes (save a
   * protocol, or explicitly skip). This is the one signal App.tsx uses to
   * decide whether onboarding needs to run — NOT `legalAcceptedVersion`,
   * which only records legal acceptance and is written mid-wizard (so using
   * it as the completion flag meant quitting partway through skipped every
   * remaining step forever, and bumping the legal version re-ran the entire
   * wizard including language/install/notifications). See App.tsx.
   */
  onboardingCompletedAt?: string // ISO datetime
  /**
   * Optional so no Dexie version bump is needed (`settings: 'id'` indexes
   * only the key; existing rows stay valid with this field simply absent).
   * Missing/undefined means 'system' — see src/lib/theme.ts for resolution.
   */
  theme?: ThemeMode
  /** Results tracking (src/lib/results.ts): display unit for weight; unset = the brand's default. */
  weightUnit?: WeightUnit
  /** Goal weight in whole grams, if the user set one. */
  goalWeightGrams?: number
  /** The user's edits to the side-effect symptom list. */
  symptoms?: SymptomPrefs
}

export type VialStatus = 'active' | 'finished' | 'discarded'

/**
 * A physical vial the user has opened. Its starting amount is stored; what's
 * left is always derived (starting amount minus every `taken` DoseLog linked
 * to it — see src/lib/vials.ts), never stored, for the same reason upcoming
 * doses aren't stored (see schedule.ts's header): only what actually
 * happened is persisted, so the two can never disagree.
 *
 * Exactly one of `totalMcg` / `totalMilliIU` is set, matching the compound's
 * kind, at the same integer storage precision as DoseLog.
 */
export interface Vial {
  id: string
  compoundId: string
  /** The protocol drawing from this vial. A protocol has at most one active vial. */
  protocolId?: string
  totalMcg?: number
  totalMilliIU?: number
  /** Diluent added at reconstitution, in mL — informational (the mix is already reflected in the protocol's saved draw). */
  diluentMl?: number
  lot?: string
  batch?: string
  /** Expiry printed on the vial/label, yyyy-MM-dd. */
  expiresOn?: string
  /** When the vial was opened/mixed, yyyy-MM-dd. */
  openedOn: string
  /**
   * The user's own discard-by date, yyyy-MM-dd. Never defaulted by the app:
   * suggesting how long a mixed vial stays usable would be a product claim
   * (see BrandConfig.defaultDiscardDays for the client-supplied exception).
   */
  discardOn?: string
  status: VialStatus
  /** ISO datetime the vial was marked finished/discarded. */
  closedAt?: string
  notes?: string
  createdAt: string // ISO datetime
  updatedAt: string // ISO datetime
}

/**
 * A user's own protocol saved for reuse (Phase 2, "save as template"). Same
 * shape as a built-in ProtocolTemplate, but with a user-given name instead
 * of an i18n key. The table exists from schema v2 so adding the feature
 * needs no further migration.
 */
export interface UserTemplate {
  id: string
  name: string
  compoundId: string
  doseAmount: number
  doseUnit: 'mg' | 'mcg' | 'IU'
  schedule: Schedule
  reminderTimes: string[]
  route: Route
  titration?: Titration
  siteTracking?: { sites: SiteId[] }
  createdAt: string // ISO datetime
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
  vials!: EntityTable<Vial, 'id'>
  userTemplates!: EntityTable<UserTemplate, 'id'>
  weights!: EntityTable<WeightEntry, 'id'>
  checkIns!: EntityTable<CheckIn, 'date'>

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
    // v2 (Phase 2): vial tracking and user templates. Purely additive — new
    // tables only; the new optional fields (DoseLog.vialId,
    // Compound.isCustom) aren't indexed, so no existing row needs upgrading.
    this.version(2).stores({
      vials: 'id, compoundId, protocolId',
      userTemplates: 'id',
    })
    // v3: results tracking — weights (any number a day) and one check-in per
    // day, keyed by its date. New tables only, nothing to upgrade.
    this.version(3).stores({
      weights: 'id, measuredAt',
      checkIns: 'date',
    })
  }
}

export const db = new PeptidesDB()

/**
 * Compounds are seeded content, not user data, but the catalogue can change
 * between app releases. Upserting on every open (instead of a one-time
 * populate hook) keeps an existing install's compound list in sync without a
 * migration step, while never touching the user's own protocols/logs — or
 * their custom compounds, which share this table (`isCustom: true`, ids
 * prefixed `custom-` so a catalogue id can never collide with one).
 *
 * A built-in the brand's store also sells has been replaced by its store row
 * (same id, store name — see src/lib/storeCatalogue.ts); re-seeding skips
 * those so it can't undo the store sync. One transaction, so a sync landing
 * mid-seed can't be overwritten either.
 */
export async function ensureCompoundsSeeded(): Promise<void> {
  await db.transaction('rw', db.compounds, async () => {
    const storeIds = new Set(await db.compounds.filter((c) => c.source === 'store').primaryKeys())
    await db.compounds.bulkPut(COMPOUNDS.filter((c) => !storeIds.has(c.id)))
  })
}

export async function ensureSettingsRow(defaults: Omit<Settings, 'id'>): Promise<Settings> {
  const existing = await db.settings.get(SETTINGS_ID)
  if (existing) return existing
  const settings: Settings = { id: SETTINGS_ID, ...defaults }
  await db.settings.put(settings)
  return settings
}
