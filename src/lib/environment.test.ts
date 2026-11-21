import { describe, expect, it } from 'vitest'
import { environmentFromContext, ordersAllowed } from './environment'

describe('environmentFromContext', () => {
  it("maps Netlify's deploy contexts, and treats anything else as a local run", () => {
    expect(environmentFromContext('production')).toBe('production')
    expect(environmentFromContext('branch-deploy')).toBe('staging')
    expect(environmentFromContext('deploy-preview')).toBe('preview')
    expect(environmentFromContext('dev')).toBe('development')
    expect(environmentFromContext(undefined)).toBe('development')
    expect(environmentFromContext('Production')).toBe('development')
  })

  it('allows orders only on staging and locally', () => {
    expect(ordersAllowed('staging')).toBe(true)
    expect(ordersAllowed('development')).toBe(true)
    expect(ordersAllowed('production')).toBe(false)
    expect(ordersAllowed('preview')).toBe(false)
  })
})
