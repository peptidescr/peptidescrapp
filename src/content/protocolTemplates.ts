/**
 * Starter protocol templates — a named, pre-filled compound + dose + schedule
 * a user can pick instead of building a protocol from scratch, then still
 * edit before saving (same form either way).
 *
 * IMPORTANT — dose amounts here are MY best-effort starter examples drawn
 * from commonly-published community dosing ranges for each compound, not
 * clinical guidance, not vetted by the client, and not sourced from any
 * particular competitor's actual numbers (I don't have those). This is a
 * deliberate exception to the brief's "never suggest a dose" rule — added at
 * the developer's explicit direction after I flagged the conflict (see
 * NOTES.md). Treat every `doseAmount` below the same way as the legal.ts
 * placeholder text: a draft the client should review and adjust before this
 * ships, not a finished, approved value. One-line change per template once
 * they do.
 *
 * Names deliberately mirror the familiar goal-oriented style used elsewhere
 * in this category (e.g. "Weight Loss Beginner", "GH Blast") rather than
 * neutral compound names — that naming choice, and the liability it implies
 * for a seller-operated app, is the client/developer's call, not mine.
 */

import type { Route } from '../lib/db'
import type { Schedule } from '../lib/schedule'
import type { MassUnit } from '../lib/units'

export interface ProtocolTemplate {
  id: string
  /** i18n key under `templates.items.<id>.name` */
  nameKey: string
  compoundId: string
  doseAmount: number
  doseUnit: MassUnit | 'IU'
  schedule: Schedule
  reminderTimes: string[]
  route: Route
}

export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  {
    id: 'wolverine',
    nameKey: 'templates.items.wolverine.name',
    compoundId: 'bpc-157-plus-tb-500-wolverine-stack',
    doseAmount: 500,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['08:00'],
    route: 'subcutaneous',
  },
  {
    id: 'joint-support',
    nameKey: 'templates.items.jointSupport.name',
    compoundId: 'bpc-157',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['08:00'],
    route: 'subcutaneous',
  },
  {
    id: 'weight-loss-beginner',
    nameKey: 'templates.items.weightLossBeginner.name',
    compoundId: 'semaglutide',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: { kind: 'everyNDays', n: 7 },
    reminderTimes: ['08:00'],
    route: 'subcutaneous',
  },
  {
    id: 'sleep-optimization',
    nameKey: 'templates.items.sleepOptimization.name',
    compoundId: 'dsip',
    doseAmount: 100,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['21:00'],
    route: 'subcutaneous',
  },
  {
    id: 'skin-rejuvenation',
    nameKey: 'templates.items.skinRejuvenation.name',
    compoundId: 'ghk-cu',
    doseAmount: 1,
    doseUnit: 'mg',
    schedule: { kind: 'everyNDays', n: 2 },
    reminderTimes: ['08:00'],
    route: 'subcutaneous',
  },
  {
    id: 'recomposition',
    nameKey: 'templates.items.recomposition.name',
    compoundId: 'cjc-1295-no-dac-plus-ipa',
    doseAmount: 300,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['21:00'],
    route: 'subcutaneous',
  },
  {
    id: 'longevity-basics',
    nameKey: 'templates.items.longevityBasics.name',
    compoundId: 'epithalon',
    doseAmount: 5,
    doseUnit: 'mg',
    schedule: { kind: 'cycle', daysOn: 10, daysOff: 20 },
    reminderTimes: ['08:00'],
    route: 'subcutaneous',
  },
  {
    id: 'gh-blast',
    nameKey: 'templates.items.ghBlast.name',
    compoundId: 'hgh',
    doseAmount: 2,
    doseUnit: 'IU',
    schedule: { kind: 'daily' },
    reminderTimes: ['08:00'],
    route: 'subcutaneous',
  },
  {
    id: 'brain-boost',
    nameKey: 'templates.items.brainBoost.name',
    compoundId: 'semax',
    doseAmount: 300,
    doseUnit: 'mcg',
    schedule: { kind: 'daily' },
    reminderTimes: ['08:00'],
    route: 'other',
  },
]

export function getProtocolTemplateById(id: string): ProtocolTemplate | undefined {
  return PROTOCOL_TEMPLATES.find((t) => t.id === id)
}
