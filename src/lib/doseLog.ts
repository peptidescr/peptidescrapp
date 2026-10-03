import { getCompoundById } from '../content/compounds'
import { db, type DoseLog, type DoseStatus, type Protocol } from './db'
import { requestPushSync } from './push'
import { microgramsFromMass, milliIUFromIU, type MassUnit } from './units'
import { doseOn } from './titration'
import { findActiveVialId } from './vials'

/** Shared by Home's catch-up/quick-log and History's manual entry. */
export async function logProtocolDose(
  protocol: Protocol,
  status: DoseStatus,
  administeredAt: Date,
): Promise<void> {
  const compound = getCompoundById(protocol.compoundId)
  const isIU = compound?.defaultUnit === 'IU'
  const now = new Date().toISOString()
  // The dose in force on the day it was administered — a titration step may
  // have changed it since the protocol started (or, when backfilling, since).
  const dose = doseOn(protocol, administeredAt)
  // Recorded against the protocol's active vial, if it has one, so the
  // vial's remaining amount and doses-left follow automatically (vials.ts).
  const vialId = await findActiveVialId(protocol.id)

  const doseLog: DoseLog = {
    id: crypto.randomUUID(),
    protocolId: protocol.id,
    compoundId: protocol.compoundId,
    doseMcg: isIU ? undefined : microgramsFromMass(dose.amount, dose.unit as MassUnit),
    doseIU: isIU ? milliIUFromIU(dose.amount) : undefined,
    administeredAt: administeredAt.toISOString(),
    status,
    createdAt: now,
    updatedAt: now,
  }
  if (vialId) doseLog.vialId = vialId
  await db.doseLogs.put(doseLog)
  // A dose logged ahead of time must not still be pushed at its scheduled moment.
  requestPushSync()
}
