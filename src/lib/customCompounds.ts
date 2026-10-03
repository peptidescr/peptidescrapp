/**
 * The user's own compounds (Phase 2): anything they log that isn't in the
 * brand's catalogue. Stored in the same Dexie `compounds` table as the
 * catalogue (flagged `isCustom`) so the service worker's notification text,
 * which reads compound names straight from that table, needs no changes.
 *
 * The app reads compounds synchronously through src/content/compounds.ts;
 * this module keeps that in-memory mirror in step with the database, and is
 * the only place custom compounds are written.
 */
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import type { TFunction } from 'i18next'
import type { ComboboxOption } from '@/components/ui/combobox'
import {
  CUSTOM_CATEGORY,
  getCompoundById,
  getCustomCompounds,
  isStoreListed,
  listDiluents,
  listSelectableCompounds,
  setCustomCompounds,
  subscribeToCompounds,
  type Compound,
  type CompoundForm,
  type CompoundUnit,
} from '../content/compounds'
import { db } from './db'
import { MAX_NAME_LENGTH, sanitizeText } from './sanitize'

export interface CustomCompoundInput {
  name: string
  defaultUnit: CompoundUnit
  form: CompoundForm
  /** In the unit vialSizeUnit() gives for this unit/form — see compounds.ts. May be empty. */
  vialSizes: number[]
}

let loaded = false
const loadedListeners = new Set<() => void>()

/**
 * Starts mirroring the database's custom compounds into memory, for the
 * life of the page. Called once from main.tsx, before the first render; the
 * App's loading gate waits on useCustomCompoundsLoaded() so nothing ever
 * renders a custom compound's id in place of its name.
 */
export function startCustomCompoundSync(): void {
  liveQuery(() => db.compounds.filter((c) => c.isCustom === true).toArray()).subscribe({
    next: (list) => {
      setCustomCompounds(list)
      if (!loaded) {
        loaded = true
        for (const listener of loadedListeners) listener()
      }
    },
    error: (err: unknown) => console.error('custom compound sync failed', err),
  })
}

export function useCustomCompoundsLoaded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      loadedListeners.add(listener)
      return () => loadedListeners.delete(listener)
    },
    () => loaded,
  )
}

/** Picker list (catalogue + custom), re-rendering when a custom compound is added, renamed or removed. */
export function useSelectableCompounds(): Compound[] {
  return useSyncExternalStore(subscribeToCompounds, listSelectableCompounds)
}

/**
 * One compound by id, re-rendering when the store catalogue or custom
 * compounds change it — e.g. once a sync brings in the store's product links.
 */
export function useCompound(id: string): Compound | undefined {
  return useSyncExternalStore(subscribeToCompounds, () => getCompoundById(id))
}

/** The calculator's quick-fill diluents, re-rendering when the store catalogue changes them. */
export function useDiluents(): Compound[] {
  return useSyncExternalStore(subscribeToCompounds, listDiluents)
}

export function useCustomCompounds(): readonly Compound[] {
  return useSyncExternalStore(subscribeToCompounds, getCustomCompounds)
}

/** Catalogue and store categories are shown as stored; the custom category is a key, shown translated. */
export function compoundCategoryLabel(compound: Compound, t: TFunction): string {
  return compound.category === CUSTOM_CATEGORY ? t('compounds.customCategory') : compound.category
}

/**
 * Picker options for a listSelectableCompounds() list: "From the store" and
 * "Other" headings once a store catalogue is loaded (the list is already in
 * that order), and the app's own name for a renamed compound kept searchable.
 */
export function toCompoundOptions(compounds: readonly Compound[], t: TFunction): ComboboxOption[] {
  const grouped = compounds.some(isStoreListed)
  return compounds.map((c) => ({
    value: c.id,
    label: c.name,
    hint: compoundCategoryLabel(c, t),
    keywords: c.aliases?.join(' '),
    group: grouped ? (isStoreListed(c) ? t('compounds.groupStore') : t('compounds.groupOther')) : undefined,
  }))
}

/** Normalises user input into a stored compound. Throws RangeError on anything unusable. */
export function buildCustomCompound(input: CustomCompoundInput, id: string): Compound {
  const name = sanitizeText(input.name, MAX_NAME_LENGTH).trim()
  if (!name) throw new RangeError('name is required')
  const vialSizes = [...new Set(input.vialSizes)]
    .filter((size) => Number.isFinite(size) && size > 0)
    .sort((a, b) => a - b)
  return {
    id,
    name,
    category: CUSTOM_CATEGORY,
    defaultUnit: input.defaultUnit,
    vialSizes,
    form: input.form,
    isBlend: false,
    isDiluent: false,
    isCustom: true,
  }
}

/**
 * Writes also update the in-memory mirror straight away (the live query
 * confirms it a moment later), so a picker can select a compound the
 * instant it's created instead of briefly not finding it.
 */
function mirrorPut(compound: Compound): void {
  setCustomCompounds([...getCustomCompounds().filter((c) => c.id !== compound.id), compound])
}

export async function createCustomCompound(input: CustomCompoundInput): Promise<Compound> {
  const compound = buildCustomCompound(input, `custom-${crypto.randomUUID()}`)
  await db.compounds.put(compound)
  mirrorPut(compound)
  return compound
}

export async function updateCustomCompound(
  id: string,
  input: CustomCompoundInput,
): Promise<Compound> {
  const existing = await db.compounds.get(id)
  if (!existing?.isCustom) throw new Error('not a custom compound')
  const compound = buildCustomCompound(input, id)
  await db.compounds.put(compound)
  mirrorPut(compound)
  return compound
}

/**
 * True while anything still points at the compound. Deleting it then would
 * leave history rows and protocols showing a bare id, so the UI only offers
 * delete when this is false.
 */
export async function isCompoundInUse(id: string): Promise<boolean> {
  const [protocols, logs, vials] = await Promise.all([
    db.protocols.where('compoundId').equals(id).count(),
    db.doseLogs.where('compoundId').equals(id).count(),
    db.vials.where('compoundId').equals(id).count(),
  ])
  return protocols + logs + vials > 0
}

export async function deleteCustomCompound(id: string): Promise<void> {
  if (await isCompoundInUse(id)) throw new Error('compound is in use')
  const existing = await db.compounds.get(id)
  if (!existing?.isCustom) return
  await db.compounds.delete(id)
  setCustomCompounds(getCustomCompounds().filter((c) => c.id !== id))
}
