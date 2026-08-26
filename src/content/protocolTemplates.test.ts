import { describe, expect, it } from 'vitest'
import { getCompoundById } from './compounds'
import { PROTOCOL_TEMPLATES } from './protocolTemplates'

describe('protocol templates', () => {
  it('has unique ids', () => {
    const ids = PROTOCOL_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('references a real, selectable compound', () => {
    for (const template of PROTOCOL_TEMPLATES) {
      const compound = getCompoundById(template.compoundId)
      expect(compound, `template "${template.id}" references unknown compound "${template.compoundId}"`).toBeDefined()
      expect(compound!.isDiluent).toBe(false)
    }
  })

  it('matches its dose unit to the compound kind (IU only for IU compounds)', () => {
    for (const template of PROTOCOL_TEMPLATES) {
      const compound = getCompoundById(template.compoundId)!
      if (compound.defaultUnit === 'IU') {
        expect(template.doseUnit).toBe('IU')
      } else {
        expect(template.doseUnit).not.toBe('IU')
      }
    }
  })

  it('has a positive dose amount and at least one reminder time', () => {
    for (const template of PROTOCOL_TEMPLATES) {
      expect(template.doseAmount).toBeGreaterThan(0)
      expect(template.reminderTimes.length).toBeGreaterThan(0)
    }
  })
})
