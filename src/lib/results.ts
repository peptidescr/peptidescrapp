/**
 * Results tracking (Tier 1 #1): what happens to the person, next to what
 * they took — weight, side effects with severity, a short daily check-in,
 * optional measurements and a daily note. Like everything else it stays on
 * the device and travels only in the user's own backups.
 *
 * Stored as two tables (db.ts, schema v3): `weights`, any number per day,
 * each with its own time; and `checkIns`, one per calendar day, keyed by the
 * date, holding everything else for that day. The goal weight, the unit and
 * the symptom list are preferences, kept on the settings row.
 *
 * Weight is stored in whole grams and waist in whole millimetres, whatever
 * the display unit, so switching kg/lb never rounds a stored value.
 */
import { BRAND } from '../brand'
import { toIsoDate } from './dates'
import { db, SETTINGS_ID, type Settings } from './db'
import { MAX_NAME_LENGTH, MAX_NOTES_LENGTH, sanitizeMultiline, sanitizeText } from './sanitize'

export type WeightUnit = 'kg' | 'lb'

export interface WeightEntry {
  id: string
  measuredAt: string // ISO datetime
  /** Whole grams. */
  grams: number
  createdAt: string
}

/** 1 (low) – 5 (high), each optional. */
export type Rating = 1 | 2 | 3 | 4 | 5
/** 1 mild, 2 moderate, 3 severe. A symptom not felt is simply absent. */
export type Severity = 1 | 2 | 3

export const CHECK_IN_SCALES = ['energy', 'mood', 'sleep', 'foodNoise'] as const
export type CheckInScale = (typeof CHECK_IN_SCALES)[number]

export interface CheckIn {
  /** yyyy-MM-dd — the primary key: one check-in per day. */
  date: string
  energy?: Rating
  mood?: Rating
  sleep?: Rating
  /** Appetite / "food noise": 1 quiet – 5 loud. */
  foodNoise?: Rating
  /** Symptom id → severity, for symptoms felt that day. */
  sideEffects?: Record<string, Severity>
  waistMm?: number
  /** Body fat, percent. */
  bodyFatPct?: number
  note?: string
  updatedAt: string
}

/** The built-in symptom list; each is shown translated (`symptoms.<id>`). */
export const BUILT_IN_SYMPTOMS = [
  'nausea',
  'constipation',
  'diarrhea',
  'heartburn',
  'fatigue',
  'headache',
  'dizziness',
  'injection-site-reaction',
  'injection-pain',
] as const

/** The user's edits to the symptom list: built-ins they hid, and their own additions. */
export interface SymptomPrefs {
  hidden: string[]
  custom: { id: string; name: string }[]
}

export interface Symptom {
  id: string
  /** For the user's own symptoms; built-ins are named through i18n. */
  name?: string
}

export const MAX_CUSTOM_SYMPTOMS = 30

export function symptomList(prefs: SymptomPrefs | undefined): Symptom[] {
  const hidden = new Set(prefs?.hidden ?? [])
  return [
    ...BUILT_IN_SYMPTOMS.filter((id) => !hidden.has(id)).map((id) => ({ id })),
    ...(prefs?.custom ?? []).map(({ id, name }) => ({ id, name })),
  ]
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const GRAMS_PER_LB = 453.59237
const MM_PER_INCH = 25.4

/** USA Peptide Depot's customers are in the US; Peptides CR's use metric. Switchable in Progress. */
export function defaultWeightUnit(): WeightUnit {
  return BRAND.id === 'upd' ? 'lb' : 'kg'
}

export function weightUnitOf(settings: Pick<Settings, 'weightUnit'> | undefined): WeightUnit {
  return settings?.weightUnit ?? defaultWeightUnit()
}

export function gramsFrom(value: number, unit: WeightUnit): number {
  return Math.round(unit === 'kg' ? value * 1000 : value * GRAMS_PER_LB)
}

/** A stored weight in the display unit, to one decimal. */
export function weightIn(grams: number, unit: WeightUnit): number {
  return Math.round((unit === 'kg' ? grams / 1000 : grams / GRAMS_PER_LB) * 10) / 10
}

/** Waist follows the weight unit: cm with kg, inches with lb. */
export function lengthUnitFor(unit: WeightUnit): 'cm' | 'in' {
  return unit === 'kg' ? 'cm' : 'in'
}

export function mmFrom(value: number, unit: 'cm' | 'in'): number {
  return Math.round(unit === 'cm' ? value * 10 : value * MM_PER_INCH)
}

export function lengthIn(mm: number, unit: 'cm' | 'in'): number {
  return Math.round((unit === 'cm' ? mm / 10 : mm / MM_PER_INCH) * 10) / 10
}

/** Plausible human weights, as a guard against typos (and a unit mix-up). */
export const MIN_WEIGHT_GRAMS = 20_000
export const MAX_WEIGHT_GRAMS = 400_000

export function isPlausibleWeight(grams: number): boolean {
  return Number.isFinite(grams) && grams >= MIN_WEIGHT_GRAMS && grams <= MAX_WEIGHT_GRAMS
}

// ---------------------------------------------------------------------------
// Weight progress
// ---------------------------------------------------------------------------

export interface WeightProgress {
  /** The earliest weight on record — the starting point. */
  start: WeightEntry | null
  latest: WeightEntry | null
  /** latest − start, in grams (negative = lost). */
  changeGrams: number | null
  /** Change as a percent of the start weight. */
  changePct: number | null
  goalGrams: number | null
  /** Share of the way from start to goal, 0–1+ (can exceed 1), or null without a goal. */
  toGoal: number | null
}

/** `weights` in any order. */
export function weightProgress(weights: readonly WeightEntry[], goalGrams: number | undefined): WeightProgress {
  const sorted = [...weights].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const start = sorted[0] ?? null
  const latest = sorted[sorted.length - 1] ?? null
  const changeGrams = start && latest ? latest.grams - start.grams : null
  const changePct = start && changeGrams !== null ? Math.round((changeGrams / start.grams) * 1000) / 10 : null
  const goal = goalGrams ?? null
  const span = start && goal !== null ? goal - start.grams : null
  const toGoal = span && changeGrams !== null ? changeGrams / span : null
  return { start, latest, changeGrams, changePct, goalGrams: goal, toGoal }
}

/**
 * Weights logged before the first taken dose — the "before first dose"
 * baseline Shotsy keeps separate. Empty when nothing was logged that early.
 */
export function baselineWeights(weights: readonly WeightEntry[], firstDoseAt: string | undefined): WeightEntry[] {
  if (!firstDoseAt) return [...weights]
  return weights.filter((w) => w.measuredAt < firstDoseAt)
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function addWeight(grams: number, measuredAt: Date = new Date()): Promise<WeightEntry> {
  if (!isPlausibleWeight(grams)) throw new RangeError('implausible weight')
  const now = new Date().toISOString()
  const entry: WeightEntry = { id: crypto.randomUUID(), measuredAt: measuredAt.toISOString(), grams, createdAt: now }
  await db.weights.add(entry)
  return entry
}

export async function deleteWeight(id: string): Promise<void> {
  await db.weights.delete(id)
}

/** Drops empty and out-of-range fields, so a check-in only stores what was actually answered. */
export function cleanCheckIn(input: Omit<CheckIn, 'updatedAt'>, updatedAt: string): CheckIn {
  const result: CheckIn = { date: input.date, updatedAt }
  for (const scale of CHECK_IN_SCALES) {
    const value = input[scale]
    if (value !== undefined && Number.isInteger(value) && value >= 1 && value <= 5) result[scale] = value
  }
  const sideEffects = Object.fromEntries(
    Object.entries(input.sideEffects ?? {}).filter(([, s]) => Number.isInteger(s) && s >= 1 && s <= 3),
  ) as Record<string, Severity>
  if (Object.keys(sideEffects).length) result.sideEffects = sideEffects
  if (input.waistMm !== undefined && input.waistMm > 0 && input.waistMm < 3000) result.waistMm = Math.round(input.waistMm)
  if (input.bodyFatPct !== undefined && input.bodyFatPct > 0 && input.bodyFatPct < 80) {
    result.bodyFatPct = Math.round(input.bodyFatPct * 10) / 10
  }
  const note = sanitizeMultiline(input.note ?? '', MAX_NOTES_LENGTH).trim()
  if (note) result.note = note
  return result
}

/** True when a check-in holds nothing worth keeping. */
export function isEmptyCheckIn(checkIn: CheckIn): boolean {
  return Object.keys(checkIn).every((key) => key === 'date' || key === 'updatedAt')
}

/** Saves a day's check-in, or removes it when everything was cleared. */
export async function saveCheckIn(input: Omit<CheckIn, 'updatedAt'>): Promise<void> {
  const checkIn = cleanCheckIn(input, new Date().toISOString())
  if (isEmptyCheckIn(checkIn)) await db.checkIns.delete(checkIn.date)
  else await db.checkIns.put(checkIn)
}

export function todayKey(now: Date = new Date()): string {
  return toIsoDate(now)
}

export async function addCustomSymptom(prefs: SymptomPrefs | undefined, name: string): Promise<void> {
  const clean = sanitizeText(name, MAX_NAME_LENGTH).trim()
  const current = prefs ?? { hidden: [], custom: [] }
  if (!clean || current.custom.length >= MAX_CUSTOM_SYMPTOMS) return
  await updateSymptomPrefs({ ...current, custom: [...current.custom, { id: `custom-${crypto.randomUUID()}`, name: clean }] })
}

export async function updateSymptomPrefs(prefs: SymptomPrefs): Promise<void> {
  await db.settings.update(SETTINGS_ID, { symptoms: prefs })
}
