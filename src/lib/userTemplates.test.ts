import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { PROTOCOL_TEMPLATES } from '../content/protocolTemplates'
import type { Protocol } from './db'
import { buildUserTemplate, prefillFromBuiltIn, prefillFromUserTemplate } from './userTemplates'

const protocol: Protocol = {
  id: 'p1',
  name: 'Knee stack',
  compoundId: 'bpc-157',
  doseAmount: 250,
  doseUnit: 'mcg',
  schedule: { kind: 'cycleWeeks', inner: { kind: 'weekdays', days: [1, 3, 5] }, weeksOn: 8, weeksOff: 4 },
  reminderTimes: ['08:00', '20:00'],
  startDate: '2026-01-05',
  endDate: '2026-06-01',
  route: 'subcutaneous',
  isActive: false,
  trackingStartsAt: '2026-01-05T08:00:00.000Z',
  titration: { steps: [{ doseAmount: 250, weeks: 2 }, { doseAmount: 500, weeks: 4 }] },
  siteTracking: { sites: ['thigh-left', 'thigh-right'] },
  reconstitution: {
    vialSize: 10, vialUnit: 'mg', diluentMl: 2, syringeType: 'U-100', drawVolumeMl: 0.05, drawSyringeUnits: 5,
    doseAmount: 250, doseUnit: 'mcg', savedAt: '2026-01-05T08:00:00.000Z',
  },
}

describe('buildUserTemplate', () => {
  it('keeps what a new protocol reuses, and nothing tied to this one', () => {
    const template = buildUserTemplate(protocol, '  My knee plan  ', 't1', '2026-02-01T00:00:00.000Z')
    expect(template).toEqual({
      id: 't1',
      name: 'My knee plan',
      compoundId: 'bpc-157',
      doseAmount: 250,
      doseUnit: 'mcg',
      schedule: protocol.schedule,
      reminderTimes: ['08:00', '20:00'],
      route: 'subcutaneous',
      titration: protocol.titration,
      siteTracking: protocol.siteTracking,
      createdAt: '2026-02-01T00:00:00.000Z',
    })
  })

  it('needs a name', () => {
    expect(() => buildUserTemplate(protocol, '   ', 't1', 'now')).toThrow(RangeError)
  })
})

describe('prefills', () => {
  it('give the form the same shape from a built-in or a saved template', () => {
    const t = ((key: string) => `translated:${key}`) as unknown as TFunction
    const builtIn = prefillFromBuiltIn(PROTOCOL_TEMPLATES[0]!, t)
    expect(builtIn.name).toBe(`translated:${PROTOCOL_TEMPLATES[0]!.nameKey}`)
    const saved = prefillFromUserTemplate(buildUserTemplate(protocol, 'Mine', 't1', 'now'))
    expect(saved).toMatchObject({ name: 'Mine', titration: protocol.titration, siteTracking: protocol.siteTracking })
    expect(Object.keys(builtIn).sort()).toEqual(
      Object.keys(saved).filter((k) => k !== 'titration' && k !== 'siteTracking').sort(),
    )
  })

  it('drops hand-picked days that have already passed', () => {
    const custom = buildUserTemplate(
      { ...protocol, schedule: { kind: 'custom', dates: ['2026-03-01', '2026-03-10', '2026-03-20'] } },
      'Days',
      't2',
      'now',
    )
    expect(prefillFromUserTemplate(custom, new Date(2026, 2, 10, 15)).schedule).toEqual({
      kind: 'custom',
      dates: ['2026-03-10', '2026-03-20'],
    })
  })
})
