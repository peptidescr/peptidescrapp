import { describe, expect, it } from 'vitest'
import { getBrand, PCR_BRAND, UPD_BRAND } from './brands'
import i18n from '../i18n'

describe('brand configs', () => {
  it.each([PCR_BRAND, UPD_BRAND])('$id offers its own default locale', (brand) => {
    expect(brand.locales).toContain(brand.defaultLocale)
  })

  it('Peptides CR is bilingual, Spanish first; USA Peptide Depot is English only', () => {
    expect(PCR_BRAND.locales).toEqual(['es-CR', 'en'])
    expect(PCR_BRAND.defaultLocale).toBe('es-CR')
    expect(UPD_BRAND.locales).toEqual(['en'])
    expect(UPD_BRAND.defaultLocale).toBe('en')
  })

  it.each([PCR_BRAND, UPD_BRAND])('$id ships with the store features off', (brand) => {
    // Shop, Rewards and Home's store cards are Part B: a site turns them on
    // with VITE_STORE_ENABLED (src/brand/index.ts), never by default.
    expect(brand.features.store).toBe(false)
  })

  it.each([PCR_BRAND, UPD_BRAND])('$id has a hero logo from its own brand folder', (brand) => {
    expect(brand.heroLogo.src).toMatch(/^\/brand\/.+\.png$/)
    expect(brand.heroLogo.width).toBeGreaterThan(0)
    expect(brand.heroLogo.height).toBeGreaterThan(0)
  })

  it.each([PCR_BRAND, UPD_BRAND])('$id has a light theme colour that is a page-background hex', (brand) => {
    expect(brand.themeColors.light).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('rejects an unknown brand id instead of silently picking one', () => {
    expect(getBrand('pcr')).toBe(PCR_BRAND)
    expect(getBrand('upd')).toBe(UPD_BRAND)
    expect(() => getBrand('peptidescr')).toThrow(/Unknown brand/)
  })
})

describe('i18n brand name', () => {
  it('fills {{appName}} in every string from the build brand', async () => {
    await i18n.changeLanguage('en')
    // The test build is the default brand (upd).
    expect(i18n.t('onboarding.install.title')).toBe('Install USA Peptide Depot')
    expect(i18n.t('onboarding.install.title')).not.toContain('{{')
  })
})
