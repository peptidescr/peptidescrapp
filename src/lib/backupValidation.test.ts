import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, parseBackup } from './backupValidation'

const protocol = {
  id: 'p1',
  name: 'Knee stack',
  compoundId: 'bpc-157',
  doseAmount: 250,
  doseUnit: 'mcg',
  schedule: { kind: 'daily' },
  reminderTimes: ['08:00'],
  startDate: '2026-03-01',
  route: 'subcutaneous',
  isActive: true,
}
const log = {
  id: 'l1',
  protocolId: 'p1',
  compoundId: 'bpc-157',
  doseMcg: 250,
  administeredAt: '2026-03-02T14:00:00.000Z',
  status: 'taken',
  createdAt: '2026-03-02T14:00:00.000Z',
  updatedAt: '2026-03-02T14:00:00.000Z',
}
const backup = (over: Record<string, unknown> = {}) => ({
  version: BACKUP_VERSION,
  exportedAt: '2026-03-05T10:00:00.000Z',
  protocols: [protocol],
  doseLogs: [log],
  ...over,
})

describe('parseBackup', () => {
  it('accepts a well-formed backup', () => {
    const result = parseBackup(backup())
    expect(result.protocols).toHaveLength(1)
    expect(result.doseLogs).toHaveLength(1)
    expect(result.protocols[0]?.schedule).toEqual({ kind: 'daily' })
  })

  it('accepts every schedule kind', () => {
    const schedules = [
      { kind: 'everyNDays', n: 3 },
      { kind: 'weekdays', days: [1, 3, 5] },
      { kind: 'cycle', daysOn: 5, daysOff: 2 },
      { kind: 'custom', dates: ['2026-03-09', '2026-03-04'] },
    ]
    for (const schedule of schedules) {
      expect(() => parseBackup(backup({ protocols: [{ ...protocol, schedule }] }))).not.toThrow()
    }
  })

  it('rejects schedules that would break the app or make no sense', () => {
    const bad = [
      { kind: 'nope' },
      { kind: 'everyNDays', n: 0 },
      { kind: 'everyNDays', n: 1.5 },
      { kind: 'everyNDays', n: 100000 },
      { kind: 'weekdays', days: [] },
      { kind: 'weekdays', days: [9] },
      { kind: 'cycle', daysOn: 0, daysOff: 1 },
      { kind: 'custom', dates: [] },
      { kind: 'custom', dates: ['2026-02-31'] },
      { kind: 'custom', dates: ['not a date'] },
      'daily',
      null,
    ]
    for (const schedule of bad) {
      expect(() => parseBackup(backup({ protocols: [{ ...protocol, schedule }] }))).toThrow()
    }
  })

  it('rejects bad field values', () => {
    const bads: Record<string, unknown>[] = [
      { doseAmount: -1 },
      { doseAmount: '250' },
      { doseAmount: Number.POSITIVE_INFINITY },
      { doseAmount: 1e12 },
      { doseUnit: 'lbs' },
      { route: 'oral' },
      { reminderTimes: [] },
      { reminderTimes: ['25:00'] },
      { reminderTimes: ['8:00'] },
      { startDate: '01/03/2026' },
      { isActive: 'yes' },
      { id: '' },
      { id: 'x'.repeat(101) },
    ]
    for (const over of bads) {
      expect(() => parseBackup(backup({ protocols: [{ ...protocol, ...over }] }))).toThrow()
    }
    const badLogs: Record<string, unknown>[] = [
      { status: 'maybe' },
      { administeredAt: 'soon' },
      { doseMcg: -5 },
      { compoundId: 7 },
    ]
    for (const over of badLogs) {
      expect(() => parseBackup(backup({ doseLogs: [{ ...log, ...over }] }))).toThrow()
    }
  })

  it('rejects wrong versions, wrong shapes, duplicate ids and oversized lists', () => {
    expect(() => parseBackup(null)).toThrow()
    expect(() => parseBackup([])).toThrow()
    expect(() => parseBackup(backup({ version: 3 }))).toThrow()
    expect(() => parseBackup(backup({ version: '2' }))).toThrow()
    expect(() => parseBackup(backup({ protocols: 'x' }))).toThrow()
    expect(() => parseBackup(backup({ protocols: [protocol, protocol] }))).toThrow()
    const tooMany = Array.from({ length: 1001 }, (_, i) => ({ ...protocol, id: `p${i}` }))
    expect(() => parseBackup(backup({ protocols: tooMany }))).toThrow()
  })

  it('drops unknown fields instead of storing them', () => {
    const result = parseBackup(backup({ protocols: [{ ...protocol, evil: '<script>' }], extra: 1 }))
    expect(result.protocols[0]).not.toHaveProperty('evil')
    expect(result).not.toHaveProperty('extra')
  })

  it('sanitizes free text on the way in', () => {
    const result = parseBackup(
      backup({
        protocols: [{ ...protocol, name: '  Knee\u202E\u0000 stack  ' + 'x'.repeat(200) }],
        doseLogs: [{ ...log, notes: 'felt fine\u0000\nsecond line\u202E' + 'y'.repeat(2000) }],
      }),
    )
    const name = result.protocols[0]?.name ?? ''
    const notes = result.doseLogs[0]?.notes ?? ''
    const forbidden = [String.fromCharCode(0x202e), String.fromCharCode(0)]
    for (const ch of forbidden) {
      expect(name.includes(ch)).toBe(false)
      expect(notes.includes(ch)).toBe(false)
    }
    expect(name.length).toBeLessThanOrEqual(60)
    expect(notes).toContain('\nsecond line')
    expect(notes.length).toBeLessThanOrEqual(1000)
  })

  it('falls back for missing bookkeeping stamps, and drops (not fails on) a bad saved mix', () => {
    const bare: Record<string, unknown> = { ...log }
    delete bare.createdAt
    delete bare.updatedAt
    const result = parseBackup(
      backup({ doseLogs: [bare], protocols: [{ ...protocol, reconstitution: { vialSize: 'lots' } }] }),
    )
    expect(result.doseLogs[0]?.createdAt).toBe(log.administeredAt)
    expect(result.protocols[0]).not.toHaveProperty('reconstitution')
  })

  it('whitelists settings and rejects an unknown locale', () => {
    const ok = parseBackup(
      backup({ settings: { id: 99, locale: 'en', syringeType: 'U-100', theme: 'dark', injected: true } }),
    )
    expect(ok.settings).toEqual({ id: 1, locale: 'en', syringeType: 'U-100', theme: 'dark' })
    expect(() => parseBackup(backup({ settings: { locale: 'fr', syringeType: 'U-100' } }))).toThrow()
    expect(() => parseBackup(backup({ settings: { locale: 'en', syringeType: '5mL' } }))).toThrow()
    expect(() => parseBackup(backup({ settings: { locale: 'en', syringeType: 'U-100', syringeSizeMl: 2 } }))).toThrow()
  })
})

describe('parseBackup, format v2 (custom compounds)', () => {
  const custom = {
    id: 'custom-1',
    name: 'My compound',
    category: 'whatever',
    defaultUnit: 'mg',
    vialSizes: [5, 10],
    form: 'powder',
    isBlend: true,
    isDiluent: true,
    isCustom: true,
  }

  it('still imports a v1 file, with no custom compounds', () => {
    const result = parseBackup(backup({ version: 1 }))
    expect(result.version).toBe(2)
    expect(result.protocols).toHaveLength(1)
    expect(result.customCompounds).toEqual([])
  })

  it('round-trips custom compounds, normalising what is the app\'s to decide', () => {
    const result = parseBackup(backup({ customCompounds: [custom] }))
    // Category and flags are the app's, never the file's.
    expect(result.customCompounds).toEqual([{ ...custom, category: 'custom', isBlend: false, isDiluent: false }])
  })

  it('reads a Phase 2 (v2) backup that also carries vials and templates, keeping only the custom compounds', () => {
    const result = parseBackup(backup({ customCompounds: [custom], vials: [{ id: 'v1' }], userTemplates: [{ id: 't1' }] }))
    expect(result.customCompounds).toHaveLength(1)
    expect(result).not.toHaveProperty('vials')
    expect(result).not.toHaveProperty('userTemplates')
  })

  it('only accepts custom-prefixed ids, so a backup can never overwrite a catalogue entry', () => {
    expect(() => parseBackup(backup({ customCompounds: [{ ...custom, id: 'bpc-157' }] }))).toThrow()
    expect(() => parseBackup(backup({ customCompounds: [{ ...custom, name: '   ' }] }))).toThrow()
  })

  it('rejects bad units, forms and sizes, duplicate ids, and oversized lists', () => {
    expect(() => parseBackup(backup({ customCompounds: [{ ...custom, defaultUnit: 'kg' }] }))).toThrow()
    expect(() => parseBackup(backup({ customCompounds: [{ ...custom, form: 'gas' }] }))).toThrow()
    expect(() => parseBackup(backup({ customCompounds: [{ ...custom, vialSizes: ['x'] }] }))).toThrow()
    expect(() => parseBackup(backup({ customCompounds: [custom, custom] }))).toThrow()
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ ...custom, id: `custom-${i}` }))
    expect(() => parseBackup(backup({ customCompounds: tooMany }))).toThrow()
  })

  it('sanitizes the name', () => {
    const result = parseBackup(backup({ customCompounds: [{ ...custom, name: '  Mine\u202E\u0000  ' + 'x'.repeat(200) }] }))
    const name = result.customCompounds[0]?.name ?? ''
    expect(name.includes(String.fromCharCode(0x202e))).toBe(false)
    expect(name.includes(String.fromCharCode(0))).toBe(false)
    expect(name.length).toBeLessThanOrEqual(60)
  })
})

describe('parseBackup, syringe sizes', () => {
  const mix = {
    vialSize: 5,
    vialUnit: 'mg',
    diluentMl: 2,
    syringeType: 'U-100',
    drawVolumeMl: 0.4,
    drawSyringeUnits: 40,
    doseAmount: 1,
    doseUnit: 'mg',
    savedAt: '2026-03-02T14:00:00.000Z',
  }
  const withMix = (over: Record<string, unknown>) =>
    parseBackup(backup({ protocols: [{ ...protocol, reconstitution: { ...mix, ...over } }] })).protocols[0]?.reconstitution

  it('keeps a barrel size on settings and on a saved mix', () => {
    const settings = parseBackup(backup({ settings: { locale: 'en', syringeType: 'U-50', syringeSizeMl: 3 } })).settings
    expect(settings).toMatchObject({ syringeType: 'U-50', syringeSizeMl: 3 })
    for (const sizeMl of [0.3, 0.5, 1, 3]) {
      expect(withMix({ syringeSizeMl: sizeMl })).toMatchObject({ syringeSizeMl: sizeMl })
    }
    expect(withMix({ syringeSizeMl: 3 })).toMatchObject({ syringeType: 'U-100', syringeSizeMl: 3, drawSyringeUnits: 40 })
  })

  it('leaves the size out when the file has none, which means 1 mL', () => {
    expect(withMix({})).not.toHaveProperty('syringeSizeMl')
    const settings = parseBackup(backup({ settings: { locale: 'en', syringeType: 'U-100' } })).settings
    expect(settings).not.toHaveProperty('syringeSizeMl')
  })

  it('reads a backup made while 3 mL was a type of its own as a 3 mL U-100', () => {
    // A mix of 4 marks of 0.1 mL is 40 U-100 units: the same 0.4 mL.
    expect(withMix({ syringeType: '3mL', drawSyringeUnits: 4 })).toMatchObject({
      syringeType: 'U-100',
      syringeSizeMl: 3,
      drawSyringeUnits: 40,
      drawVolumeMl: 0.4,
    })
    const settings = parseBackup(backup({ settings: { locale: 'en', syringeType: '3mL' } })).settings
    expect(settings).toMatchObject({ syringeType: 'U-100', syringeSizeMl: 3 })
  })

  it('rejects a size that is not a barrel', () => {
    expect(withMix({ syringeSizeMl: 2 })).toBeUndefined() // a bad saved mix is dropped, not fatal
  })
})