import { describe, expect, it } from 'vitest'
import type { FetchLike } from './catalogue.ts'
import { fieldNames, handleRewardsRequest, UPD_REWARDS_URL } from './rewards.ts'

const get = (auth?: string) => new Request('https://app.example.com/api/rewards', { headers: auth ? { Authorization: auth } : {} })

function upd(reply: () => Response) {
  const calls: { url: string; headers?: Record<string, string> }[] = []
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers })
    return reply()
  }
  return { fetchFn, calls }
}

describe('GET /api/rewards', () => {
  it('passes the customer\'s token to UPD and its answer back', async () => {
    const net = upd(() => Response.json({ enabled: true, points: { balance: 5 } }))
    const res = await handleRewardsRequest(get('Bearer aaa.bbb.ccc'), 'upd', net.fetchFn)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: true, points: { balance: 5 } })
    expect(net.calls).toEqual([{ url: UPD_REWARDS_URL, headers: { Accept: 'application/json', Authorization: 'Bearer aaa.bbb.ccc' } }])
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('asks nothing of UPD without a token-shaped sign-in, or on PCR', async () => {
    const net = upd(() => Response.json({}))
    expect((await handleRewardsRequest(get(), 'upd', net.fetchFn)).status).toBe(401)
    expect((await handleRewardsRequest(get('Bearer nope'), 'upd', net.fetchFn)).status).toBe(401)
    expect((await handleRewardsRequest(get('Bearer aaa.bbb.ccc'), 'pcr', net.fetchFn)).status).toBe(404)
    expect(net.calls).toHaveLength(0)
  })

  it('says 401 when UPD refuses the token, so the app refreshes and asks again', async () => {
    const res = await handleRewardsRequest(get('Bearer aaa.bbb.ccc'), 'upd', upd(() => Response.json({ error: 'Sign in first.' }, { status: 401 })).fetchFn)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('answers 502 when UPD fails or sends something else', async () => {
    expect((await handleRewardsRequest(get('Bearer aaa.bbb.ccc'), 'upd', upd(() => new Response('down', { status: 500 })).fetchFn)).status).toBe(502)
    expect((await handleRewardsRequest(get('Bearer aaa.bbb.ccc'), 'upd', upd(() => new Response('<html>')).fetchFn)).status).toBe(502)
    const offline: FetchLike = async () => {
      throw new Error('offline')
    }
    expect((await handleRewardsRequest(get('Bearer aaa.bbb.ccc'), 'upd', offline)).status).toBe(502)
  })

  it('logs field names only, never values', () => {
    expect(fieldNames({ points: { balance: 5 }, history: [{ date: 'x', points: 1 }], storeCreditUsd: 9 })).toEqual([
      'points',
      'points.balance',
      'history',
      'history[].date',
      'history[].points',
      'storeCreditUsd',
    ])
  })
})
