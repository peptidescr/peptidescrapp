import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { TabBar, type Tab } from './components/TabBar'
import { Toaster } from './components/ui/sonner'
import { LEGAL_VERSION } from './content/legal'
import { maybeCreateDailySnapshot } from './lib/backup'
import { db, ensureCompoundsSeeded, ensureSettingsRow } from './lib/db'
import { DEFAULT_LOCALE } from './i18n'
import { scheduleUpcomingReminders } from './lib/notifications'
import { useSettings } from './lib/useSettings'
import { HomeScreen } from './screens/HomeScreen'
import { CalculatorScreen } from './screens/CalculatorScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { ProtocolsScreen } from './screens/ProtocolsScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function App() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('home')
  const settings = useSettings()

  // Whether onboarding still needs to run. Deliberately NOT recomputed from
  // `settings` on every render: legalAcceptedVersion gets set partway through
  // the wizard (the disclaimer step), and if this were derived live it would
  // flip to "done" and unmount the wizard before the remaining steps
  // (install/notifications/first protocol) ran. Set once from the first
  // settings load, then only ever changed by the wizard's own onComplete. A
  // user who closes the app mid-wizard returns straight to the main app next
  // time (legal is already accepted) rather than mid-flow — the remaining
  // steps are also all reachable from Settings/Protocols directly, so
  // nothing is lost, just not re-prompted.
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null)
  if (settings && needsOnboarding === null) {
    setNeedsOnboarding(settings.legalAcceptedVersion !== LEGAL_VERSION)
  }

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

  if (needsOnboarding === null) {
    return <div className="min-h-dvh bg-background" />
  }

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />
  }

  return (
    <div className="min-h-dvh bg-background pb-20 pt-[env(safe-area-inset-top)]">
      <Toaster />
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'home' && (
            <HomeScreen
              onNavigateToSettings={() => setTab('settings')}
              onNavigateToProtocols={() => setTab('protocols')}
              onNavigateToHistory={() => setTab('history')}
            />
          )}
          {tab === 'calculator' && <CalculatorScreen />}
          {tab === 'protocols' && <ProtocolsScreen />}
          {tab === 'history' && <HistoryScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </motion.div>
      </AnimatePresence>
      <TabBar active={tab} onChange={setTab} labels={labels} navLabel={t('nav.ariaLabel')} />
    </div>
  )
}

export default App
