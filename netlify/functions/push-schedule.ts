import { blobScheduleStore } from '../lib/blobStore.ts'
import { handleScheduleRequest } from '../lib/pushHandlers.ts'

export default async (req: Request): Promise<Response> => handleScheduleRequest(req, blobScheduleStore())

export const config = { path: '/api/push/schedule' }
