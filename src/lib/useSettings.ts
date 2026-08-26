import { db, SETTINGS_ID, type Settings } from './db'
import { useLiveQuery } from './useLiveQuery'

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get(SETTINGS_ID), [])
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update(SETTINGS_ID, patch)
}
