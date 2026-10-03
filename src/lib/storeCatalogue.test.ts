import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPOUNDS,
  getCompoundById,
  listDiluents,
  listSelectableCompounds,
  setCustomCompounds,
  setStoreCompounds,
} from '../content/compounds'
import { PCR_STORE_ALIASES, UPD_STORE_ALIASES } from '../content/storeAliases'
// Every product each store's API returned in October 2026, run through the
// server's own normalizer (netlify/lib/catalogue.ts).
import pcrProducts from './fixtures/store-products-pcr.json'
import updProducts from './fixtures/store-products-upd.json'
import { buildStoreCompounds, parseCatalogueResponse, parseProductName, type StoreProduct } from './storeCatalogue'

afterEach(() => {
  setStoreCompounds([])
  setCustomCompounds([])
})

const pcr = buildStoreCompounds(pcrProducts as StoreProduct[], PCR_STORE_ALIASES)
const upd = buildStoreCompounds(updProducts as StoreProduct[], UPD_STORE_ALIASES)
const byId = (list: typeof pcr, id: string) => list.find((c) => c.id === id)

describe('parseProductName', () => {
  it.each([
    ['Tirzepatide 60mg', 'Tirzepatide', 'tirzepatide', 60, 'mg'],
    ['VIP 5 mg', 'VIP', 'vip', 5, 'mg'],
    ['HCG 10,000 IU', 'HCG', 'hcg', 10000, 'IU'],
    ['Bacteriostatic Water 10ml', 'Bacteriostatic Water', 'bacteriostatic-water', 10, 'mL'],
    ['HGH 50 IU (Pfizer Brand Genotropin)', 'HGH (Pfizer Brand Genotropin)', 'hgh', 50, 'IU'],
    ['KissPeptin-10 10mg', 'KissPeptin-10', 'kisspeptin-10', 10, 'mg'],
    ['IGF-1LR3 1mg', 'IGF-1LR3', 'igf-1lr3', 1, 'mg'],
    ['BPC-157 + TB 500 20mg (Wolverine Stack)', 'BPC-157 + TB 500 (Wolverine Stack)', 'bpc-157-plus-tb-500', 20, 'mg'],
    ['GLP-1 / GIP / Glucagon 10mg', 'GLP-1 / GIP / Glucagon', 'glp-1-gip-glucagon', 10, 'mg'],
    ['Semaglutide 2.5mg', 'Semaglutide', 'semaglutide', 2.5, 'mg'],
    ['NAD+ 500mg', 'NAD+', 'nadplus', 500, 'mg'],
  ])('%s', (name, displayName, groupKey, size, unit) => {
    expect(parseProductName(name)).toEqual({ displayName, groupKey, size, unit })
  })

  it('leaves a name with no size whole', () => {
    expect(parseProductName('MT-II')).toEqual({ displayName: 'MT-II', groupKey: 'mt-ii', size: undefined, unit: undefined })
  })
})

describe('alias tables', () => {
  it('only point at built-in compounds', () => {
    const ids = new Set(COMPOUNDS.map((c) => c.id))
    for (const target of [...Object.values(PCR_STORE_ALIASES), ...Object.values(UPD_STORE_ALIASES)]) {
      expect(ids.has(target), target).toBe(true)
    }
  })
})

describe('buildStoreCompounds, Peptides CR catalogue', () => {
  it('groups one product per vial size into one compound per compound', () => {
    expect(pcrProducts).toHaveLength(79)
    expect(pcr).toHaveLength(48)
    expect(new Set(pcr.map((c) => c.id)).size).toBe(pcr.length)
    expect(byId(pcr, 'tirzepatide')?.vialSizes).toEqual([10, 15, 20, 30, 40, 60, 120])
    expect(byId(pcr, 'tirzepatide')?.storeProducts?.map((p) => p.size)).toEqual([10, 15, 20, 30, 40, 60, 120])
  })

  it('keeps the built-in id under the store name, with the app name as an alias', () => {
    const reta = byId(pcr, 'retatrutide')!
    expect(reta).toMatchObject({ name: 'GLP-1', category: 'Cardiovascular Research Compounds', defaultUnit: 'mg' })
    expect(reta.aliases).toEqual(['Retatrutide'])
    expect(byId(pcr, 'fat-blaster')).toMatchObject({ name: 'Lipotropic Blend', form: 'solution', vialSizes: [10] })
    // The store files it under no category, so the built-in's stays.
    expect(byId(pcr, 'fat-blaster')?.category).toBe('Weight Loss')
  })

  it('names sizes sold under differing parentheticals by the bare name', () => {
    expect(byId(pcr, 'hgh')).toMatchObject({ name: 'HGH', defaultUnit: 'IU', vialSizes: [12, 24, 30, 50] })
    expect(byId(pcr, 'hcg')?.vialSizes).toEqual([10000])
  })

  it("keeps a built-in's own sizes when the store name doesn't give one", () => {
    expect(byId(pcr, 'mt-ii')).toMatchObject({ name: 'MT-II', vialSizes: [10] })
    expect(byId(pcr, 'mt-ii')?.storeProducts?.[0]?.size).toBeUndefined()
  })

  it('adds what the store sells beyond the built-ins, and recognises diluents', () => {
    expect(byId(pcr, 'store-tb-500')).toMatchObject({ name: 'TB-500', vialSizes: [10] })
    expect(byId(pcr, 'tb-4')?.name).toBe('TB-4') // a different product at this store
    expect(byId(pcr, 'store-hmg')).toMatchObject({ defaultUnit: 'IU', vialSizes: [75] })
    expect(byId(pcr, 'store-aa-water')).toMatchObject({ isDiluent: true, form: 'solution', vialSizes: [3] })
    expect(byId(pcr, 'bac-water')).toMatchObject({ isDiluent: true, name: 'Bacteriostatic Water', vialSizes: [3, 10] })
  })

  it('marks everything as a listed store compound', () => {
    expect(pcr.every((c) => c.source === 'store' && c.listed === true)).toBe(true)
  })
})

describe('buildStoreCompounds, USA Peptide Depot catalogue', () => {
  it('maps renamed compounds and keeps distinct ones apart', () => {
    expect(upd).toHaveLength(7)
    expect(byId(upd, 'retatrutide')).toMatchObject({ name: 'GLP-1 / GIP / Glucagon', aliases: ['Retatrutide'] })
    expect(byId(upd, 'mt-ii')?.name).toBe('Melanotan 2 (MT-2)')
    expect(byId(upd, 'ghk-cu')?.name).toBe('GHK-Cu (Copper Tripeptide)')
    // No-DAC CJC is not the built-in "CJC with DAC".
    expect(byId(upd, 'store-cjc-1295')?.name).toBe('CJC-1295 (No DAC)')
    expect(byId(upd, 'cjc-with-dac')).toBeUndefined()
  })
})

describe('parseCatalogueResponse', () => {
  const good = { version: 1, brand: 'upd', fetchedAt: '2026-10-02T12:00:00Z', products: updProducts }

  it('accepts this brand’s catalogue', () => {
    expect(parseCatalogueResponse(good, 'upd')).toHaveLength(7)
  })

  it('rejects another brand’s, another version, or an empty list', () => {
    expect(parseCatalogueResponse(good, 'pcr')).toBeNull()
    expect(parseCatalogueResponse({ ...good, version: 2 }, 'upd')).toBeNull()
    expect(parseCatalogueResponse({ ...good, products: [] }, 'upd')).toBeNull()
    expect(parseCatalogueResponse('<html>', 'upd')).toBeNull()
  })

  it('skips malformed products, cleans text and drops unsafe links', () => {
    // A right-to-left override, which would make text display as something else.
    const RLO = String.fromCharCode(0x202e)
    const parsed = parseCatalogueResponse(
      {
        ...good,
        products: [
          { name: `Ok${RLO} 5mg`, slug: 'ok-5mg', inStock: true, url: 'javascript:alert(1)' },
          { name: '', slug: 'blank' },
          'nope',
        ],
      },
      'upd',
    )
    expect(parsed).toEqual([{ name: 'Ok 5mg', slug: 'ok-5mg', inStock: true }])
  })
})

describe('store compounds in the registry', () => {
  it('answers lookups by the store name and puts the store group first in the picker', () => {
    setStoreCompounds(upd)
    expect(getCompoundById('retatrutide')?.name).toBe('GLP-1 / GIP / Glucagon')
    expect(getCompoundById('semaglutide')?.name).toBe('Semaglutide') // not sold here: the built-in

    const names = listSelectableCompounds().map((c) => c.name)
    expect(names.slice(0, 7)).toEqual([
      'BPC-157',
      'CJC-1295 (No DAC)',
      'GHK-Cu (Copper Tripeptide)',
      'GLP-1 / GIP / Glucagon',
      'KLOW',
      'Melanotan 2 (MT-2)',
      'Tesamorelin',
    ])
    expect(names).toContain('Semaglutide')
    expect(names.filter((n) => n === 'Retatrutide')).toEqual([]) // shown once, under the store name
  })

  it('moves a product the store dropped to the rest of the list, still named as the store named it', () => {
    setStoreCompounds(upd.map((c) => (c.id === 'retatrutide' ? { ...c, listed: false } : c)))
    const list = listSelectableCompounds()
    const index = list.findIndex((c) => c.id === 'retatrutide')
    expect(index).toBeGreaterThanOrEqual(6)
    expect(list[index]?.name).toBe('GLP-1 / GIP / Glucagon')
  })

  it("offers the store's diluents for quick-fill", () => {
    setStoreCompounds(pcr)
    expect(listDiluents().map((d) => d.name)).toEqual(['AA Water', 'Bacteriostatic Water'])
    expect(listSelectableCompounds().some((c) => c.isDiluent)).toBe(false)
  })
})
