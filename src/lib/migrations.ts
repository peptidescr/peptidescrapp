/**
 * One-time fixes to data saved by an earlier build, run on every open and
 * written to do nothing once there is nothing left to fix. They are not Dexie
 * version upgrades because none of them changes the tables' shape.
 */
import { db, SETTINGS_ID } from './db'
import { readLegacyMix } from './syringeLegacy'

/**
 * "3 mL" was a syringe type for a few days in October 2026 and is now a barrel
 * size (see syringeLegacy.ts). Settings and saved mixes that still carry the
 * old type are rewritten as a 3 mL U-100, in whole units rather than marks.
 */
export async function migrateLegacySyringeData(): Promise<void> {
  await db.transaction('rw', db.settings, db.protocols, async () => {
    const settings = await db.settings.get(SETTINGS_ID)
    if (settings && (settings.syringeType as string) === '3mL') {
      await db.settings.update(SETTINGS_ID, { syringeType: 'U-100', syringeSizeMl: 3 })
    }
    for (const protocol of await db.protocols.toArray()) {
      const mix = protocol.reconstitution
      if (!mix || (mix.syringeType as string) !== '3mL') continue
      const fixed = readLegacyMix('3mL', mix.drawSyringeUnits)
      await db.protocols.update(protocol.id, { reconstitution: { ...mix, ...fixed } })
    }
  })
}