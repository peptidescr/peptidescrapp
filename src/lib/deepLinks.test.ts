import { describe, expect, it } from 'vitest'
import { pageForTarget, takeOpenTarget, targetForReminderTag } from './deepLinks'
import { HOME, trackPage } from './pages'

describe('pageForTarget', () => {
  it('sends a dose reminder to Track > Today and a vial reminder to Home', () => {
    expect(pageForTarget('today')).toEqual(trackPage('today'))
    expect(pageForTarget('today')).toEqual({ tab: 'track', segment: 'today' })
    expect(pageForTarget('home')).toEqual(HOME)
  })

  it('ignores a target it does not know, so a stale link opens the app where it was', () => {
    expect(pageForTarget('shop')).toBeNull()
    expect(pageForTarget('')).toBeNull()
    expect(pageForTarget(null)).toBeNull()
    expect(pageForTarget(undefined)).toBeNull()
  })
})

describe('targetForReminderTag', () => {
  it('sends vial reminders (pushed or foreground) to Home and dose reminders to Today', () => {
    expect(targetForReminderTag('vial|v1|discard|2026-10-30')).toBe('home')
    expect(targetForReminderTag('vial-alert|v1:low')).toBe('home')
    expect(targetForReminderTag('p1|2026-10-30T15:00:00.000Z')).toBe('today')
  })

  it('has nowhere in particular for the test notification', () => {
    expect(targetForReminderTag('peptidescr-test')).toBeUndefined()
  })
})

describe('takeOpenTarget', () => {
  it('reads the target and removes it from the query string', () => {
    expect(takeOpenTarget('?open=today')).toEqual({ target: 'today', remaining: '' })
  })

  it('leaves other parameters alone', () => {
    expect(takeOpenTarget('?a=1&open=home&b=2')).toEqual({ target: 'home', remaining: '?a=1&b=2' })
  })

  it('finds nothing in an ordinary address', () => {
    expect(takeOpenTarget('')).toEqual({ target: null, remaining: '' })
    expect(takeOpenTarget('?a=1')).toEqual({ target: null, remaining: '?a=1' })
  })
})
