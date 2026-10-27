/**
 * "3 mL" was briefly a syringe type of its own (0.1 mL marks, October 2026); it is
 * now a barrel size on any type. Anything saved or exported while it was a type
 * is read as a 3 mL U-100: its marks of 0.1 mL are 10 U-100 units each, which is
 * the same volume. Used by the one-time migration of saved data (migrations.ts)
 * and by the backup importer, so an old backup restores the same way.
 */
import type { SyringeSizeMl, SyringeType } from './units'

const LEGACY_MARK_TO_U100_UNITS = 10

export function readLegacySyringeType(value: unknown): { type: unknown; sizeMl?: SyringeSizeMl } {
  return value === '3mL' ? { type: 'U-100', sizeMl: 3 } : { type: value }
}

/** A saved mix's reading, which was in 0.1 mL marks when its type was '3mL'. */
export function readLegacyMix(
  type: SyringeType | '3mL',
  drawSyringeUnits: number,
): { syringeType: SyringeType; drawSyringeUnits: number; syringeSizeMl?: SyringeSizeMl } {
  if (type !== '3mL') return { syringeType: type, drawSyringeUnits }
  return { syringeType: 'U-100', drawSyringeUnits: drawSyringeUnits * LEGACY_MARK_TO_U100_UNITS, syringeSizeMl: 3 }
}