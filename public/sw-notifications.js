// Pulled into the generated service worker via workbox.importScripts (see vite.config.ts).
// Plain JS on purpose: it runs outside the app bundle, so it can't import app code.

// --- Tapping a reminder ----------------------------------------------------
// Focuses the already-open app window, or opens the app if it's closed.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})

// --- Closed-app reminders (Web Push) ---------------------------------------
// The push server only ever sends `{ tag }`, where tag is "<protocolId>|<ISO time>"
// (src/lib/pushSchedule.ts). Everything visible — the protocol's name, the dose,
// the language — is looked up here from the phone's own IndexedDB, so none of it
// ever has to leave the device.

const TEXT = {
  en: {
    body: (dose, time) => 'Time for your ' + dose + ' dose (' + time + ').',
    generic: 'Time for your dose.',
  },
  'es-CR': {
    body: (dose, time) => 'Es hora de tu dosis de ' + dose + ' (' + time + ').',
    generic: 'Es hora de tu dosis.',
  },
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('peptidescr')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readRecord(db, store, key) {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(store).objectStore(store).get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
    } catch (err) {
      resolve(undefined)
    }
  })
}

function formatTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
}

async function buildReminder(tag) {
  const [protocolId, iso] = tag.split('|')
  let protocol
  let compound
  let locale = 'es-CR'
  try {
    const db = await openDatabase()
    const settings = await readRecord(db, 'settings', 1)
    if (settings && settings.locale) locale = settings.locale
    if (protocolId) protocol = await readRecord(db, 'protocols', protocolId)
    if (protocol) compound = await readRecord(db, 'compounds', protocol.compoundId)
    db.close()
  } catch (err) {
    // Fall through to the generic text below.
  }

  const text = TEXT[locale] || TEXT['es-CR']
  if (!protocol) return { title: 'peptidescr', body: text.generic }
  return {
    title: protocol.name || (compound && compound.name) || 'peptidescr',
    body: text.body(protocol.doseAmount + ' ' + protocol.doseUnit, formatTime(iso)),
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let tag = ''
      try {
        tag = (event.data && event.data.json().tag) || ''
      } catch (err) {
        // Malformed payload: still show *something* — a push must always
        // produce a visible notification, or the browser revokes the subscription.
      }
      const { title, body } = await buildReminder(tag)
      await self.registration.showNotification(title, {
        body,
        tag: tag || 'peptidescr-dose',
        icon: '/brand/icon-192.png',
        badge: '/brand/icon-192.png',
      })
    })(),
  )
})
