import { getCompoundById } from '../content/compounds'
import { toIsoDate } from './dates'
import { db, SETTINGS_ID, type DoseLog, type Vial } from './db'
import { BACKUP_VERSION, parseBackup, type ValidBackup } from './backupValidation'
import { csvSafeText } from './sanitize'
import { applyTheme, resolveTheme } from './theme'

const SNAPSHOT_KEEP = 7

/** An export is always the current format — see backupValidation.ts for what each version holds. */
export type BackupPayload = ValidBackup

export async function buildBackupPayload(): Promise<BackupPayload> {
  const [protocols, doseLogs, settings, vials, customCompounds, storeRows, userTemplates] = await Promise.all([
    db.protocols.toArray(),
    db.doseLogs.toArray(),
    db.settings.get(SETTINGS_ID),
    db.vials.toArray(),
    db.compounds.filter((c) => c.isCustom === true).toArray(),
    db.compounds.filter((c) => c.source === 'store').toArray(),
    db.userTemplates.toArray(),
  ])
  // The store catalogue isn't the user's data — only the entries their own
  // records use travel, so those still have names after a restore.
  const referenced = new Set([...protocols, ...doseLogs, ...vials, ...userTemplates].map((r) => r.compoundId))
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    protocols,
    doseLogs,
    settings,
    vials,
    customCompounds,
    storeCompounds: storeRows.filter((c) => referenced.has(c.id)),
    userTemplates,
  }
}

export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2)
}

function csvField(value: string | number): string {
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function doseLogsToCsv(doseLogs: DoseLog[], vials: Vial[] = []): string {
  const header = [
    'compound',
    'doseAmountMg',
    'doseAmountMcg',
    'doseAmountIU',
    'administeredAt',
    'status',
    'notes',
    'vialLot',
    'vialBatch',
    'injectionSite',
  ]
  const vialsById = new Map(vials.map((v) => [v.id, v]))
  const rows = doseLogs.map((log) => {
    const compound = getCompoundById(log.compoundId)
    const vial = log.vialId ? vialsById.get(log.vialId) : undefined
    // Text cells go through csvSafeText so a note like =HYPERLINK(...) can't run as a formula when the file is opened.
    return [
      csvSafeText(compound?.name ?? log.compoundId),
      log.doseMcg !== undefined ? String(log.doseMcg / 1000) : '',
      log.doseMcg !== undefined ? String(log.doseMcg) : '',
      log.doseIU !== undefined ? String(log.doseIU / 1000) : '',
      log.administeredAt,
      log.status,
      csvSafeText(log.notes ?? ''),
      csvSafeText(vial?.lot ?? ''),
      csvSafeText(vial?.batch ?? ''),
      log.site ?? '',
    ]
  })
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')
}

/**
 * Wipes and replaces all of the user's own data (protocols, dose logs,
 * settings, vials, custom compounds, user templates) from a previously
 * exported backup. Catalogue rows in `compounds` are never replaced: a store
 * compound from the file is only added where this device has no store row
 * for that id yet (its own synced one is newer).
 */
export async function importBackupPayload(input: unknown): Promise<void> {
  // Re-validated here too, not only where a file is picked, so no caller can
  // put unchecked data into the database.
  const payload = parseBackup(input)
  const tables = [db.protocols, db.doseLogs, db.settings, db.vials, db.compounds, db.userTemplates]
  await db.transaction('rw', tables, async () => {
    await db.protocols.clear()
    await db.doseLogs.clear()
    await db.vials.clear()
    await db.userTemplates.clear()
    const oldCustomIds = await db.compounds.filter((c) => c.isCustom === true).primaryKeys()
    await db.compounds.bulkDelete(oldCustomIds)
    if (payload.protocols.length) await db.protocols.bulkAdd(payload.protocols)
    if (payload.doseLogs.length) await db.doseLogs.bulkAdd(payload.doseLogs)
    if (payload.vials.length) await db.vials.bulkAdd(payload.vials)
    if (payload.customCompounds.length) await db.compounds.bulkPut(payload.customCompounds)
    const syncedStoreIds = new Set(await db.compounds.filter((c) => c.source === 'store').primaryKeys())
    const missingStore = payload.storeCompounds.filter((c) => !syncedStoreIds.has(c.id))
    if (missingStore.length) await db.compounds.bulkPut(missingStore)
    if (payload.userTemplates.length) await db.userTemplates.bulkAdd(payload.userTemplates)
    if (payload.settings) await db.settings.put({ ...payload.settings, id: SETTINGS_ID })
  })

  // A restored backup can carry a different `theme` than what's currently
  // applied (buildBackupPayload spreads the whole settings row). Without
  // this, the localStorage pre-paint mirror stays stale until the next
  // explicit theme change, and the *next* cold start would flash the old
  // theme once before Dexie's real value caught up. Re-resolve and re-apply
  // immediately so both the live app and the mirror reflect the import.
  applyTheme(resolveTheme(payload.settings?.theme ?? 'system'))
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Primary backup path: hand the file to the OS share sheet so the user can
 * send it to their own WhatsApp/email in two taps. Falls back to a plain
 * download when Web Share (with files) isn't available, or if the user's
 * share attempt errors for a reason other than cancelling.
 */
export async function shareOrDownloadFile(
  content: string,
  filename: string,
  mime: string,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const file = new File([content], filename, { type: mime })
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean
    share?: (data: { files: File[]; title?: string }) => Promise<void>
  }

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // fall through to download on any other share failure
    }
  }
  downloadFile(content, filename, mime)
  return 'downloaded'
}

export async function markBackedUp(): Promise<void> {
  await db.settings.update(SETTINGS_ID, { lastBackupAt: new Date().toISOString() })
}

/**
 * Approximates "nightly" without a background job: creates at most one
 * snapshot per calendar day, on whichever app open first happens that day,
 * and prunes to the last 7. There's no backend and no service-worker
 * periodic sync available across platforms here, so "the app was opened at
 * least once that day" is the honest substitute for a true nightly cron.
 */
export async function maybeCreateDailySnapshot(): Promise<void> {
  const latest = await db.snapshots.orderBy('createdAt').last()
  const today = toIsoDate(new Date())
  if (latest && toIsoDate(new Date(latest.createdAt)) === today) return

  const payload = await buildBackupPayload()
  await db.snapshots.add({ createdAt: new Date().toISOString(), json: backupToJson(payload) })

  const all = await db.snapshots.orderBy('createdAt').toArray()
  if (all.length > SNAPSHOT_KEEP) {
    const excess = all.slice(0, all.length - SNAPSHOT_KEEP)
    await db.snapshots.bulkDelete(excess.map((s) => s.id!))
  }
}
