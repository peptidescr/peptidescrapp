import { describe, expect, it } from 'vitest'
import {
  COMPOUNDS,
  compareAlphabetical,
  listCategories,
  listDiluents,
  listSelectableCompounds,
  vialSizeUnit,
} from './compounds'

describe('compound catalogue', () => {
  it('has unique ids', () => {
    const ids = COMPOUNDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every compound at least one vial size', () => {
    for (const c of COMPOUNDS) {
      expect(c.vialSizes.length).toBeGreaterThan(0)
    }
  })

  it('keeps diluents out of the selectable list', () => {
    const selectable = listSelectableCompounds()
    expect(selectable.some((c) => c.isDiluent)).toBe(false)
    expect(listDiluents().length).toBeGreaterThan(0)
  })

  it('lists selectable compounds and categories alphabetically', () => {
    const names = listSelectableCompounds().map((c) => c.name)
    expect(names).toEqual([...names].sort(compareAlphabetical))
    expect(names[0]).toBe('5-amino-1mq')
    const categories = listCategories()
    expect(categories).toEqual([...categories].sort(compareAlphabetical))
  })

  it('sorts numbers inside names numerically and ignores case', () => {
    expect(['TB-10', 'tb-4'].sort(compareAlphabetical)).toEqual(['tb-4', 'TB-10'])
  })

  it('derives the right vial size unit per compound kind', () => {
    const hgh = COMPOUNDS.find((c) => c.id === 'hgh')!
    const bacWater = COMPOUNDS.find((c) => c.id === 'bac-water')!
    const bpc157 = COMPOUNDS.find((c) => c.id === 'bpc-157')!
    expect(vialSizeUnit(hgh)).toBe('IU')
    expect(vialSizeUnit(bacWater)).toBe('mL')
    expect(vialSizeUnit(bpc157)).toBe('mg')
  })
})
