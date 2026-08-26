import { getCompoundById } from '../content/compounds'
import { db, type DoseLog, type DoseStatus, type Protocol } from './db'
import { microgramsFromMass, milliIUFromIU, type MassUnit } from './units'

/** Shared by Home's catch-up/quick-log and History's manual entry. */
export async function logProtocolDose(
  protocol: Protocol,
  status: DoseStatus,
  administeredAt: Date,
): Promise<void> {
  const compound = getCompoundById(protocol.compoundId)
  const isIU = compound?.defaultUnit === 'IU'
  const now = new Date().toISOString()

  const doseLog: DoseLog = {
    id: crypto.randomUUID(),
    protocolId: protocol.id,
    compoundId: protocol.compoundId,
    doseMcg: isIU ? undefined : microgramsFromMass(protocol.doseAmount, protocol.doseUnit as MassUnit),
    doseIU: isIU ? milliIUFromIU(protocol.doseAmount) : undefined,
    administeredAt: administeredAt.toISOString(),
    status,
    createdAt: now,
    updatedAt: now,
  }
  await db.doseLogs.put(doseLog)
}
