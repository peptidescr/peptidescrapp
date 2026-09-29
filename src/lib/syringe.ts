/**
 * Geometry for the visual syringe (Phase 2): which barrel to draw for a
 * reading, where its graduations go, and how far to fill it. Pure, so the
 * picture can't drift from the number printed beside it — both come from the
 * same `drawUnits` the calculator already rounded down to a whole unit
 * (see quantizeVolumeToSyringe in units.ts).
 *
 * Barrels are the common sizes each syringe type is actually sold in; the
 * smallest one that holds the draw is shown, so a 12-unit draw fills a
 * readable share of a 30-unit barrel rather than a sliver of a 100-unit one.
 * The printed number, not the picture, is the reading to follow — the
 * graphic is there so it can be matched against the syringe in hand.
 */
import type { SyringeType } from './units'

export interface SyringeScale {
  /** Barrel capacity, in this syringe type's units. */
  capacityUnits: number
  /** Distance between adjacent graduation marks, in units. */
  minorStep: number
  /** Every this-many units a mark is long and numbered. */
  majorStep: number
}

const BARRELS: Record<SyringeType, SyringeScale[]> = {
  // 0.3 mL, 0.5 mL and 1 mL barrels. 1 mL U-100 barrels are marked every 2 units.
  'U-100': [
    { capacityUnits: 30, minorStep: 1, majorStep: 5 },
    { capacityUnits: 50, minorStep: 1, majorStep: 5 },
    { capacityUnits: 100, minorStep: 2, majorStep: 10 },
  ],
  'U-50': [
    { capacityUnits: 25, minorStep: 1, majorStep: 5 },
    { capacityUnits: 50, minorStep: 1, majorStep: 5 },
  ],
  'U-40': [
    { capacityUnits: 20, minorStep: 1, majorStep: 5 },
    { capacityUnits: 40, minorStep: 1, majorStep: 5 },
  ],
}

export interface SyringeLayout extends SyringeScale {
  /** 0..1 share of the barrel filled. */
  fillFraction: number
  /** The draw doesn't fit even the largest barrel — the picture shows it full and says so. */
  overflow: boolean
  ticks: { units: number; major: boolean }[]
}

export function layoutSyringe(type: SyringeType, drawUnits: number): SyringeLayout {
  const barrels = BARRELS[type]
  const draw = Math.max(0, drawUnits)
  const scale = barrels.find((b) => draw <= b.capacityUnits) ?? barrels[barrels.length - 1]!
  const ticks: SyringeLayout['ticks'] = []
  for (let units = 0; units <= scale.capacityUnits; units += scale.minorStep) {
    ticks.push({ units, major: units % scale.majorStep === 0 })
  }
  return {
    ...scale,
    fillFraction: Math.min(1, draw / scale.capacityUnits),
    overflow: draw > scale.capacityUnits,
    ticks,
  }
}
