import { describe, expect, it } from 'vitest'
import { SAMPLE_STATE, testAccount } from './account'
import { NO_SPEND, redeemFor, spendEstimate } from './spend'

const account = testAccount(SAMPLE_STATE, new Date('2026-11-18T12:00:00Z')) // 900 points ($27), $60 credit

describe('spendEstimate', () => {
  it('takes credit first, then points, never more than the order needs', () => {
    expect(spendEstimate(account, 100, { ...NO_SPEND, useCredit: true, usePoints: true })).toEqual({ creditUsd: 60, pointsUsd: 27, rewardPoints: 0 })
    expect(spendEstimate(account, 70, { ...NO_SPEND, useCredit: true, usePoints: true })).toEqual({ creditUsd: 60, pointsUsd: 10, rewardPoints: 0 })
    expect(spendEstimate(account, 40, { ...NO_SPEND, useCredit: true })).toEqual({ creditUsd: 40, pointsUsd: 0, rewardPoints: 0 })
  })

  it('leaves the fixed rewards\' points out of the points spent, and spends none below the minimum', () => {
    expect(spendEstimate(account, 100, { useCredit: false, usePoints: true, rewards: ['free_delivery'] })).toEqual({ creditUsd: 0, pointsUsd: 18, rewardPoints: 300 })
    expect(spendEstimate({ ...account, points: 200 }, 100, { ...NO_SPEND, usePoints: true }).pointsUsd).toBe(0)
    expect(spendEstimate(null, 100, { ...NO_SPEND, useCredit: true })).toEqual({ creditUsd: 0, pointsUsd: 0, rewardPoints: 0 })
  })
})

describe('redeemFor', () => {
  it('sends UPD what is available, for UPD to use as needed', () => {
    expect(redeemFor(account, { useCredit: true, usePoints: true, rewards: ['free_delivery'] })).toEqual({ creditUsd: 60, points: 600, rewards: ['free_delivery'] })
    expect(redeemFor(account, NO_SPEND)).toBeUndefined()
    expect(redeemFor({ ...account, points: 200 }, { ...NO_SPEND, usePoints: true })).toBeUndefined()
  })
})
