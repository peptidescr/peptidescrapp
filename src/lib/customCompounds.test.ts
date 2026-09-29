import { afterEach, describe, expect, it } from 'vitest'
import {
  compareAlphabetical,
  getCompoundById,
  listSelectableCompounds,
  setCustomCompounds,
  subscribeToCompounds,
} from '../content/compounds'
import { buildCustomCompound } from './customCompounds'

afterEach(() => setCustomCompounds([]))

describe('buildCustomCompound', () => {
  it('normalises input into a stored custom compound', () => {
    const compound = buildCustomCompound(
      {
        name: '  My‮ peptide  ',
        defaultUnit: 'mcg',
        form: 'powder',
        vialSizes: [10, 5, 5, 0, -1, NaN],
      },
      'custom-1',
    )
    expect(compound).toEqual({
      id: 'custom-1',
      name: 'My peptide',
      category: 'custom',
      defaultUnit: 'mcg',
      vialSizes: [5, 10],
      form: 'powder',
      isBlend: false,
      isDiluent: false,
      isCustom: true,
    })
  })

  it('rejects a blank name', () => {
    expect(() =>
      buildCustomCompound(
        { name: '   ', defaultUnit: 'mg', form: 'powder', vialSizes: [] },
        'custom-1',
      ),
    ).toThrow(RangeError)
  })
})

describe('custom compound registry', () => {
  const custom = buildCustomCompound(
    { name: 'Aaa custom', defaultUnit: 'IU', form: 'solution', vialSizes: [] },
    'custom-x',
  )

  it('answers lookups and picker lists for custom compounds alongside the catalogue', () => {
    expect(getCompoundById('custom-x')).toBeUndefined()
    setCustomCompounds([custom])
    expect(getCompoundById('custom-x')?.name).toBe('Aaa custom')
    expect(getCompoundById('bpc-157')?.name).toBe('BPC-157')
    // Merged into the alphabetical order, not appended at the end.
    const names = listSelectableCompounds().map((c) => c.name)
    expect(names).toContain('Aaa custom')
    expect(names).toEqual([...names].sort(compareAlphabetical))
    expect(names.indexOf('Aaa custom')).toBeLessThan(names.indexOf('BPC-157'))
  })

  it('keeps the picker list referentially stable until the set changes, and notifies subscribers', () => {
    const before = listSelectableCompounds()
    expect(listSelectableCompounds()).toBe(before)
    let calls = 0
    const unsubscribe = subscribeToCompounds(() => calls++)
    setCustomCompounds([custom])
    expect(calls).toBe(1)
    expect(listSelectableCompounds()).not.toBe(before)
    unsubscribe()
    setCustomCompounds([])
    expect(calls).toBe(1)
  })
})
