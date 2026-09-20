import webpush from 'web-push'
import { sendDueReminders } from '../lib/pushHandlers.ts'
import { blobScheduleStore } from '../lib/blobStore.ts'

/**
 * Runs every minute (Netlify scheduled function) and pushes every reminder
 * that has come due. Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
 * VAPID_SUBJECT (a mailto: or https: contact) in the site's environment.
 */
export default async (): Promise<Response> => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.error('push-send: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not set')
    return new Response('not configured', { status: 500 })
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const result = await sendDueReminders(blobScheduleStore(), async (subscription, payload) => {
    await webpush.sendNotification(subscription, payload, { TTL: 60 * 60, urgency: 'high' })
  })
  if (result.sent || result.failed || result.devicesRemoved) console.log('push-send', JSON.stringify(result))
  return Response.json(result)
}

export const config = { schedule: '* * * * *' }
