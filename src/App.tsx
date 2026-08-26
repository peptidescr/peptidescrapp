import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TabBar, type Tab } from './components/TabBar'
import { maybeCreateDailySnapshot } from './lib/backup'
import { db, ensureCompoundsSeeded, ensureSettingsRow } from './lib/db'
import { DEFAULT_LOCALE } from './i18n'
import { scheduleUpcomingReminders } from './lib/notifications'
import { useSettings } from './lib/useSettings'
import { HomeScreen } from './screens/HomeScreen'
import { CalculatorScreen } from './screens/CalculatorScreen'
import { ProtocolsScreen } from './screens/ProtocolsScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function App() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('home')
  const settings = useSettings()

  // Runs once per app open: seed/sync the read-only compound catalogue,
  // create the singleton settings row on first run, ask the platform to
  // persist storage (protects against iOS Safari's 7-day IndexedDB eviction;
  // harmless no-op once installed), take today's snapshot if one hasn't run
  // yet, and best-effort schedule any Chromium Notification Triggers for the
  // next couple of days (silently does nothing where unsupported — see
  // notifications.ts).
  useEffect(() => {
    void ensureCompoundsSeeded()
    void ensureSettingsRow({ locale: DEFAULT_LOCALE, syringeType: 'U-100' })
    if (navigator.storage?.persist) {
      void navigator.storage.persist()
    }
    void maybeCreateDailySnapshot()
    void db.protocols.toArray().then((protocols) => scheduleUpcomingReminders(protocols))
  }, [])

  useEffect(() => {
    if (settings && settings.locale !== i18n.language) {
      void i18n.changeLanguage(settings.locale)
    }
  }, [settings, i18n])

  const labels = {
    home: t('nav.home'),
    calculator: t('nav.calculator'),
    protocols: t('nav.protocols'),
    history: t('nav.history'),
    settings: t('nav.settings'),
  }

  return (
    <div className="min-h-dvh bg-brand-surface-2 pb-20 pt-[env(safe-area-inset-top)]">
      {tab === 'home' && <HomeScreen onNavigateToSettings={() => setTab('settings')} />}
      {tab === 'calculator' && <CalculatorScreen />}
      {tab === 'protocols' && <ProtocolsScreen />}
      {tab === 'history' && <HistoryScreen />}
      {tab === 'settings' && <SettingsScreen />}
      <TabBar active={tab} onChange={setTab} labels={labels} />
    </div>
  )
}

export default App
