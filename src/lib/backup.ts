import { getCompoundById } from '../content/compounds'
import { toIsoDate } from './dates'
import { db, SETTINGS_ID, type DoseLog, type Protocol, type Settings } from './db'

const BACKUP_VERSION = 1
const SNAPSHOT_KEEP = 7

export interface BackupPayload {
  version: typeof BACKUP_VERSION
  exportedAt: string
  protocols: Protocol[]
  doseLogs: DoseLog[]
  settings?: Settings
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const [protocols, doseLogs, settings] = await Promise.all([
    db.protocols.toArray(),
    db.doseLogs.toArray(),
    db.settings.get(SETTINGS_ID),
  ])
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), protocols, doseLogs, settings }
}

export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2)
}

function csvField(value: string | number): string {
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function doseLogsToCsv(doseLogs: DoseLog[]): string {
  const header = [
    'compound',
    'doseAmountMg',
    'doseAmountMcg',
    'doseAmountIU',
    'administeredAt',
    'status',
    'notes',
  ]
  const rows = doseLogs.map((log) => {
    const compound = getCompoundById(log.compoundId)
    return [
      compound?.name ?? log.compoundId,
      log.doseMcg !== undefined ? String(log.doseMcg / 1000) : '',
      log.doseMcg !== undefined ? String(log.doseMcg) : '',
      log.doseIU !== undefined ? String(log.doseIU / 1000) : '',
      log.administeredAt,
      log.status,
      log.notes ?? '',
    ]
  })
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')
}

/** Wipes and replaces protocols/doseLogs/settings from a previously exported backup. */
export async function importBackupPayload(payload: BackupPayload): Promise<void> {
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(payload.version)}`)
  }
  if (!Array.isArray(payload.protocols) || !Array.isArray(payload.doseLogs)) {
    throw new Error('Malformed backup file')
  }
  await db.transaction('rw', db.protocols, db.doseLogs, db.settings, async () => {
    await db.protocols.clear()
    await db.doseLogs.clear()
    if (payload.protocols.length) await db.protocols.bulkAdd(payload.protocols)
    if (payload.doseLogs.length) await db.doseLogs.bulkAdd(payload.doseLogs)
    if (payload.settings) await db.settings.put({ ...payload.settings, id: SETTINGS_ID })
  })
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
