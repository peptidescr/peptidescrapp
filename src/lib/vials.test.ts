import { describe, expect, it } from 'vitest'
import type { DoseLog, Protocol, Vial } from './db'
import { buildVial, computeVialAlerts, computeVialState, protocolDoseInVialUnit } from './vials'

// Wednesday 2026-03-04, 09:00 local.
const now = new Date(2026, 2, 4, 9, 0)

const protocol: Protocol = {
  id: 'p1',
  name: '',
  compoundId: 'bpc-157',
  doseAmount: 250,
  doseUnit: 'mcg',
  schedule: { kind: 'daily' },
  reminderTimes: ['20:00'],
  startDate: '2026-03-01',
  route: 'subcutaneous',
  isActive: true,
}

const vial: Vial = {
  id: 'v1',
  compoundId: 'bpc-157',
  protocolId: 'p1',
  totalMcg: 5000, // 5 mg = 20 doses of 250 mcg
  openedOn: '2026-03-01',
  status: 'active',
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
}

function takenLog(id: string, day: number, over: Partial<DoseLog> = {}): DoseLog {
  const at = new Date(2026, 2, day, 20, 0).toISOString()
  return {
    id,
    protocolId: 'p1',
    compoundId: 'bpc-157',
    vialId: 'v1',
    doseMcg: 250,
    administeredAt: at,
    status: 'taken',
    createdAt: at,
    updatedAt: at,
    ...over,
  }
}

describe('computeVialState', () => {
  it('subtracts only taken doses logged against this vial', () => {
    const logs = [
      takenLog('a', 1),
      takenLog('b', 2),
      takenLog('c', 3, { status: 'skipped' }),
      takenLog('d', 3, { vialId: 'other' }),
      takenLog('e', 3, { vialId: undefined }),
    ]
    const state = computeVialState(vial, protocol, logs, now)
    expect(state.used).toBe(500)
    expect(state.remaining).toBe(4500)
    expect(state.remainingFraction).toBeCloseTo(0.9)
    expect(state.dosesLeft).toBe(18)
  })

  it('floors doses left and never reports a negative remaining amount', () => {
    const odd = { ...vial, totalMcg: 1100 } // 4.4 doses
    expect(computeVialState(odd, protocol, [], now).dosesLeft).toBe(4)
    const overdrawn = [takenLog('a', 1, { doseMcg: 5000 }), takenLog('b', 2, { doseMcg: 5000 })]
    const state = computeVialState(vial, protocol, overdrawn, now)
    expect(state.remaining).toBe(0)
    expect(state.dosesLeft).toBe(0)
  })

  it('projects the last dose the vial covers along the schedule, skipping doses already logged early', () => {
    const three = { ...vial, totalMcg: 750 }
    // Daily at 20:00 from now (Mar 4, 09:00): Mar 4, 5, 6 → the third is Mar 6.
    expect(computeVialState(three, protocol, [], now).lastDoseOn).toEqual(new Date(2026, 2, 6))
    // Tonight's dose logged early (not against this vial) → the three doses are Mar 5, 6, 7.
    const early = takenLog('x', 4, {
      vialId: undefined,
      administeredAt: new Date(2026, 2, 4, 8, 0).toISOString(),
    })
    expect(computeVialState(three, protocol, [early], now).lastDoseOn).toEqual(new Date(2026, 2, 7))
  })

  it('has no projection or dose count without a protocol, or for a paused one', () => {
    const loose = { ...vial, protocolId: undefined }
    const state = computeVialState(loose, undefined, [], now)
    expect(state.dosesLeft).toBeNull()
    expect(state.lastDoseOn).toBeNull()
    expect(computeVialState(vial, { ...protocol, isActive: false }, [], now).lastDoseOn).toBeNull()
  })

  it('keeps IU vials in IU and refuses to size a mass dose against them', () => {
    const iuVial: Vial = { ...vial, totalMcg: undefined, totalMilliIU: 12_000 } // 12 IU
    const iuProtocol: Protocol = { ...protocol, doseAmount: 2, doseUnit: 'IU' }
    const log = takenLog('a', 1, { doseMcg: undefined, doseIU: 2000 })
    const state = computeVialState(iuVial, iuProtocol, [log], now)
    expect(state.kind).toBe('iu')
    expect(state.remaining).toBe(10_000)
    expect(state.dosesLeft).toBe(5)
    expect(protocolDoseInVialUnit(protocol, 'iu')).toBeNull()
    expect(protocolDoseInVialUnit(iuProtocol, 'mass')).toBeNull()
  })
})

describe('computeVialAlerts', () => {
  it('is quiet for a healthy vial with no dates close', () => {
    expect(computeVialAlerts([vial], [protocol], [], now)).toEqual([])
  })

  it('flags low stock by dose count or by days until the last dose', () => {
    const three = { ...vial, totalMcg: 750 }
    expect(computeVialAlerts([three], [protocol], [], now).map((a) => a.kind)).toEqual(['lowStock'])
    // 6 doses, but only one dose a week: last dose is weeks away → not low by days, and 6 > 3.
    const weekly: Protocol = { ...protocol, schedule: { kind: 'weekdays', days: [1] } }
    expect(computeVialAlerts([{ ...vial, totalMcg: 1500 }], [weekly], [], now)).toEqual([])
    // 6 daily doses: last dose within 7 days → low even though 6 > 3.
    expect(computeVialAlerts([{ ...vial, totalMcg: 1500 }], [protocol], [], now)[0]?.kind).toBe(
      'lowStock',
    )
  })

  it('reports empty instead of low, and only for active vials', () => {
    const drained = [takenLog('a', 1, { doseMcg: 5000 })]
    expect(computeVialAlerts([vial], [protocol], drained, now).map((a) => a.kind)).toEqual([
      'empty',
    ])
    expect(computeVialAlerts([{ ...vial, status: 'finished' }], [protocol], drained, now)).toEqual(
      [],
    )
  })

  it('flags discard-by and printed expiry dates, soon and passed, most urgent first', () => {
    const dated = { ...vial, discardOn: '2026-03-06', expiresOn: '2026-03-01' }
    const alerts = computeVialAlerts([dated], [protocol], [], now)
    expect(alerts.map((a) => [a.kind, a.daysUntil])).toEqual([
      ['expired', -3],
      ['discardSoon', 2],
    ])
    const far = { ...vial, discardOn: '2026-03-08' }
    expect(computeVialAlerts([far], [protocol], [], now)).toEqual([])
  })
})

describe('buildVial', () => {
  it('stores mass vials in micrograms and IU vials in milli-IU', () => {
    const mass = buildVial(
      { compoundId: 'bpc-157', amount: 10, amountUnit: 'mg', openedOn: '2026-03-01' },
      'v',
      'now',
    )
    expect(mass.totalMcg).toBe(10_000)
    expect(mass).not.toHaveProperty('totalMilliIU')
    const iu = buildVial(
      { compoundId: 'hgh', amount: 12, amountUnit: 'IU', openedOn: '2026-03-01' },
      'v',
      'now',
    )
    expect(iu.totalMilliIU).toBe(12_000)
  })

  it('rejects a unit that does not match the compound, or a non-positive amount', () => {
    expect(() =>
      buildVial(
        { compoundId: 'hgh', amount: 12, amountUnit: 'mg', openedOn: '2026-03-01' },
        'v',
        'now',
      ),
    ).toThrow()
    expect(() =>
      buildVial(
        { compoundId: 'bpc-157', amount: 0, amountUnit: 'mg', openedOn: '2026-03-01' },
        'v',
        'now',
      ),
    ).toThrow()
  })

  it('drops blank optional fields rather than storing empty strings', () => {
    const v = buildVial(
      {
        compoundId: 'bpc-157',
        amount: 5,
        amountUnit: 'mg',
        openedOn: '2026-03-01',
        lot: '  ',
        batch: ' B1 ',
        diluentMl: 0,
      },
      'v',
      'now',
    )
    expect(v).not.toHaveProperty('lot')
    expect(v.batch).toBe('B1')
    expect(v).not.toHaveProperty('diluentMl')
  })
})
