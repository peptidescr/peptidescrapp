/**
 * "Save my protocol as a template" (Phase 2): a user's own protocols kept for
 * reuse, next to the built-in starter templates. Both become the same thing
 * — a ProtocolPrefill — before they reach the protocol form, so the form has
 * one way in whichever kind was picked.
 *
 * Stored in the `userTemplates` table (there since schema v2) and carried in
 * backups. A template is a copy, not a link: editing or deleting the protocol
 * it came from, or a protocol made from it, never touches it.
 */
import type { TFunction } from 'i18next'
import type { ProtocolTemplate } from '../content/protocolTemplates'
import { toIsoDate } from './dates'
import { db, type Protocol, type Route, type UserTemplate } from './db'
import type { SiteId } from './injectionSites'
import { MAX_NAME_LENGTH, sanitizeText } from './sanitize'
import type { Schedule } from './schedule'
import type { Titration } from './titration'

/** Everything a new protocol can be prefilled with. */
export interface ProtocolPrefill {
  name: string
  compoundId: string
  doseAmount: number
  doseUnit: Protocol['doseUnit']
  schedule: Schedule
  reminderTimes: string[]
  route: Route
  titration?: Titration
  siteTracking?: { sites: SiteId[] }
}

export function prefillFromBuiltIn(template: ProtocolTemplate, t: TFunction): ProtocolPrefill {
  return {
    name: t(template.nameKey),
    compoundId: template.compoundId,
    doseAmount: template.doseAmount,
    doseUnit: template.doseUnit,
    schedule: template.schedule,
    reminderTimes: template.reminderTimes,
    route: template.route,
  }
}

/**
 * A saved template, ready for the form. Hand-picked days are real dates, so
 * any already past are dropped — a new protocol can't start on them (the form
 * then asks for days if none are left).
 */
export function prefillFromUserTemplate(template: UserTemplate, now: Date = new Date()): ProtocolPrefill {
  const today = toIsoDate(now)
  const schedule: Schedule =
    template.schedule.kind === 'custom'
      ? { kind: 'custom', dates: template.schedule.dates.filter((d) => d >= today) }
      : template.schedule
  const prefill: ProtocolPrefill = {
    name: template.name,
    compoundId: template.compoundId,
    doseAmount: template.doseAmount,
    doseUnit: template.doseUnit,
    schedule,
    reminderTimes: template.reminderTimes,
    route: template.route,
  }
  if (template.titration) prefill.titration = template.titration
  if (template.siteTracking) prefill.siteTracking = template.siteTracking
  return prefill
}

/** A protocol's reusable parts under a name. Throws RangeError on a blank name. */
export function buildUserTemplate(protocol: Protocol, name: string, id: string, createdAt: string): UserTemplate {
  const cleanName = sanitizeText(name, MAX_NAME_LENGTH).trim()
  if (!cleanName) throw new RangeError('name is required')
  const template: UserTemplate = {
    id,
    name: cleanName,
    compoundId: protocol.compoundId,
    doseAmount: protocol.doseAmount,
    doseUnit: protocol.doseUnit,
    schedule: protocol.schedule,
    reminderTimes: [...protocol.reminderTimes],
    route: protocol.route,
    createdAt,
  }
  if (protocol.titration) template.titration = protocol.titration
  if (protocol.siteTracking) template.siteTracking = protocol.siteTracking
  return template
}

export async function saveProtocolAsTemplate(protocol: Protocol, name: string): Promise<UserTemplate> {
  const template = buildUserTemplate(protocol, name, crypto.randomUUID(), new Date().toISOString())
  await db.userTemplates.add(template)
  return template
}

export async function deleteUserTemplate(id: string): Promise<void> {
  await db.userTemplates.delete(id)
}
