import { describe, expect, it } from 'vitest'
import { HOME, isProtocolFlow, isProtocolPicker, MAX_PAGES, popPage, pushPage, tabPage, type Page } from './pages'

const list: Page = tabPage('protocols')
const picker: Page = { tab: 'protocols', view: { kind: 'picker' } }
const form: Page = { tab: 'protocols', view: { kind: 'form' } }
const calc: Page = { tab: 'calculator', protocolId: 'p1' }

describe('pushPage / popPage', () => {
  it('goes back to wherever you came from', () => {
    const edit: Page = { tab: 'protocols', view: { kind: 'form', protocolId: 'p1' } }
    const fromHome = pushPage([HOME], edit)
    expect(popPage(fromHome)).toEqual([HOME])
    const viaHistory = pushPage(pushPage([HOME], { tab: 'history' }), edit)
    expect(popPage(viaHistory)).toEqual([HOME, { tab: 'history' }])
  })

  it('adds nothing when going to the page already showing', () => {
    expect(pushPage([HOME, list], tabPage('protocols'))).toEqual([HOME, list])
  })

  it('never goes back past the first page', () => {
    expect(popPage([HOME])).toEqual([HOME])
    expect(popPage([HOME, picker, form], () => true)).toEqual([HOME])
  })

  it('skips the template picker once a new protocol is saved', () => {
    expect(popPage([HOME, list, picker, form], isProtocolPicker)).toEqual([HOME, list])
    // Cancelling the form is ordinary back: to the picker, to choose again.
    expect(popPage([HOME, list, picker, form])).toEqual([HOME, list, picker])
  })

  it('leaves a finished protocol flow behind when moving on from it', () => {
    expect(pushPage([HOME, list, picker, form], calc, isProtocolFlow)).toEqual([HOME, list, calc])
  })

  it('forgets the oldest pages past the cap', () => {
    let pages: Page[] = [HOME]
    for (let i = 0; i < MAX_PAGES + 10; i++) pages = pushPage(pages, { tab: 'calculator', protocolId: String(i) })
    expect(pages).toHaveLength(MAX_PAGES)
    expect(pages.at(-1)).toEqual({ tab: 'calculator', protocolId: String(MAX_PAGES + 9) })
  })
})
