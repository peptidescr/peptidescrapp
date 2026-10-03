import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { APP_BAR_HEIGHT, AppBar } from './components/AppBar'
import { TabBar } from './components/TabBar'
import { Toaster } from './components/ui/sonner'
import { LEGAL_VERSION } from './content/legal'
import { maybeCreateDailySnapshot } from './lib/backup'
import { backStack } from './lib/backStack'
import { HOME, popPage, pushPage, tabPage, type Page } from './lib/pages'
import { db, ensureCompoundsSeeded, ensureSettingsRow } from './lib/db'
import { useCustomCompoundsLoaded } from './lib/customCompounds'
import { startStoreCatalogueRefresh, syncStoreCatalogue, useStoreCompoundsLoaded } from './lib/storeCatalogue'
import { DEFAULT_LOCALE, toSupportedLocale } from './i18n'
import { scheduleUpcomingReminders, startReminderLoop } from './lib/notifications'
import { applyTheme, resolveTheme, subscribeToSystemTheme, type ResolvedTheme } from './lib/theme'
import { updateSettings, useSettings } from './lib/useSettings'
import { HomeScreen } from './screens/HomeScreen'
import { CalculatorScreen } from './screens/CalculatorScreen'
import { LegalGate, OnboardingScreen } from './screens/OnboardingScreen'
import { ProtocolsScreen } from './screens/ProtocolsScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SettingsScreen } from './screens/SettingsScreen'

type Gate = 'loading' | 'onboarding' | 'legalReaccept' | 'app'

function App() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()

  // Every page visited, newest last; the last one is what's showing. Back
  // (the app bar's arrow, or the phone's or browser's own back, through
  // backStack) returns to the one before. See src/lib/pages.ts.
  const [pages, setPages] = useState<Page[]>([HOME])
  const page = pages[pages.length - 1]!
  const tab = page.tab

  // Where each page in the history was scrolled to when it was left, so back
  // returns to the same spot. Indexed like `pages`.
  const scrollMemory = useRef<number[]>([])
  const lastMove = useRef<'push' | 'pop' | null>(null)

  function navigate(next: Page, leaving?: (page: Page) => boolean) {
    scrollMemory.current[pages.length - 1] = window.scrollY
    lastMove.current = 'push'
    setPages((current) => pushPage(current, next, leaving))
  }

  const goBack = useCallback((skipping?: (page: Page) => boolean) => {
    lastMove.current = 'pop'
    setPages((current) => popPage(current, skipping))
  }, [])

  const canGoBack = pages.length > 1
  useEffect(() => {
    backStack.setPageBack(canGoBack ? () => goBack() : null)
  }, [canGoBack, goBack])

  // A new page starts at the top; going back restores where that page was
  // left. Its content loads a beat after it mounts, so the restore retries for
  // a few frames until the page is tall enough to scroll that far.
  useLayoutEffect(() => {
    const move = lastMove.current
    lastMove.current = null
    if (move === 'push') window.scrollTo(0, 0)
    if (move !== 'pop') return
    const target = scrollMemory.current[pages.length - 1] ?? 0
    let frames = 0
    let raf = 0
    const tryScroll = () => {
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) > 1 && ++frames < 30) raf = requestAnimationFrame(tryScroll)
    }
    tryScroll()
    return () => cancelAnimationFrame(raf)
  }, [pages])

  /** "Next step: reconstitute" — open the calculator prefilled for a protocol. */
  function openCalculatorFor(protocolId: string, leaving?: (page: Page) => boolean) {
    navigate({ tab: 'calculator', protocolId }, leaving)
  }

  /** Tapping a protocol on Home or in History — straight to that protocol's own edit page. */
  function openProtocolEditor(protocolId: string) {
    navigate({ tab: 'protocols', view: { kind: 'form', protocolId } })
  }

  const goToTab = (next: Page['tab']) => navigate(tabPage(next))

  // Two separate questions used to be conflated into one comparison
  // (`legalAcceptedVersion !== LEGAL_VERSION`, treated as "needs onboarding"):
  // whether onboarding has ever finished, and whether the accepted legal
  // version is current. They're different — bumping LEGAL_VERSION for a
  // wording fix shouldn't re-run the whole wizard (language, install,
  // notifications, first protocol) for someone who already did all of that,
  // it should just ask them to re-accept. `onboardingCompletedAt` (set once,
  // by the wizard's own completion) answers the first question;
  // `legalAcceptedVersion` still answers only the second, which is all it
  // ever should have meant.
  //
  // Deliberately NOT recomputed from `settings` on every render — the wizard
  // writes `legalAcceptedVersion` partway through (the disclaimer step), and
  // a live derivation would flip the gate and unmount the wizard before the
  // remaining steps ran. Computed once from the first settings load, then
  // only ever changed by an explicit callback below.
  //
  // Also waits for the user's custom compounds and the last-synced store
  // catalogue to load into memory (src/lib/customCompounds.ts,
  // src/lib/storeCatalogue.ts), so no screen ever renders a compound by its
  // id, or flashes a built-in name before the store's.
  const customCompoundsLoaded = useCustomCompoundsLoaded()
  const storeCompoundsLoaded = useStoreCompoundsLoaded()
  const [gate, setGate] = useState<Gate>('loading')
  if (settings && customCompoundsLoaded && storeCompoundsLoaded && gate === 'loading') {
    const alreadyOnboardedBeforeThisFlagExisted =
      !settings.onboardingCompletedAt && settings.legalAcceptedVersion === LEGAL_VERSION
    if (alreadyOnboardedBeforeThisFlagExisted) {
      // Backfill so this branch is only ever taken once per install.
      void updateSettings({ onboardingCompletedAt: new Date().toISOString() })
      setGate('app')
    } else if (!settings.onboardingCompletedAt) {
      setGate('onboarding')
    } else if (settings.legalAcceptedVersion !== LEGAL_VERSION) {
      setGate('legalReaccept')
    } else {
      setGate('app')
    }
  }

  // Runs once per app open: seed the built-in compound catalogue, then
  // refresh the brand's store catalogue over it (after, so the seed can't
  // race the store's renames; see db.ts), and again whenever the app comes
  // back to the foreground (at most hourly — storeCatalogue.ts throttles);
  // create the singleton settings row on first run, ask the platform to
  // persist storage (protects against iOS Safari's 7-day IndexedDB eviction;
  // harmless no-op once installed), take today's snapshot if one hasn't run
  // yet, and best-effort schedule any Chromium Notification Triggers for the
  // next couple of days (silently does nothing where unsupported — see
  // notifications.ts).
  useEffect(() => {
    void ensureCompoundsSeeded().then(() => syncStoreCatalogue())
    void ensureSettingsRow({ locale: DEFAULT_LOCALE, syringeType: 'U-100' })
    if (navigator.storage?.persist) {
      void navigator.storage.persist()
    }
    void maybeCreateDailySnapshot()
    void db.protocols.toArray().then((protocols) => scheduleUpcomingReminders(protocols))
    return startStoreCatalogueRefresh()
  }, [])

  // Dose reminders: checks on a timer and whenever the app comes back to the
  // foreground, and fires a notification for anything that has just come due.
  // Only runs once the gate is open — during onboarding nobody has a protocol
  // and the permission prompt hasn't been reached yet.
  const appOpen = gate === 'app'
  useEffect(() => {
    if (!appOpen) return
    return startReminderLoop()
  }, [appOpen])

  // toSupportedLocale: a settings row (or an imported backup) can carry a
  // language this build doesn't offer — e.g. 'es-CR' on the English-only
  // brand — so that falls back to the build's default instead.
  // The correction is also saved, not just applied: the service worker reads
  // `settings.locale` directly to word closed-app reminders, and would
  // otherwise keep sending them in the language this build doesn't offer.
  useEffect(() => {
    if (!settings) return
    const locale = toSupportedLocale(settings.locale)
    if (locale !== settings.locale) void updateSettings({ locale })
    if (locale !== i18n.language) {
      void i18n.changeLanguage(locale)
    }
  }, [settings, i18n])

  // Deliberately does nothing while `settings` is still undefined (Dexie's
  // first read hasn't resolved yet) rather than falling back to a guessed
  // 'system' default — that guess briefly overwrote index.html's correct
  // pre-paint `data-theme` with the wrong one before the real value arrived
  // a beat later, producing an actual light→dark→light (or reverse) flash.
  // Caught live via CDP: a MutationObserver timeline on cold load showed
  // exactly that transition. Only re-applies once the real stored value (or
  // its documented 'system' default) is known.
  const themeMode = settings ? (settings.theme ?? 'system') : undefined

  // Mirrors whatever `applyTheme` last set on <html>, so the floating quick
  // toggle's icon (Sun/Moon) reflects the actual resolved theme rather than
  // the raw mode — under 'system' those can differ. Initialized by reading
  // the DOM directly: index.html's inline script has already set
  // `data-theme` by the time React mounts, so this is never a guess.
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    () => (document.documentElement.getAttribute('data-theme') as ResolvedTheme | null) ?? 'dark',
  )

  useEffect(() => {
    if (!themeMode) return
    const resolved = resolveTheme(themeMode)
    applyTheme(resolved)
    setResolvedTheme(resolved)
  }, [themeMode])

  // Lets 'system' mode follow the device live while the app stays open,
  // without waiting for a re-render that would trigger the effect above.
  useEffect(() => {
    if (themeMode !== 'system') return
    return subscribeToSystemTheme((prefersDark) => {
      const resolved = prefersDark ? 'dark' : 'light'
      applyTheme(resolved)
      setResolvedTheme(resolved)
    })
  }, [themeMode])

  // The floating quick-toggle's handler: a straight two-way flip (not the
  // three-way Light/Dark/System control, which stays in Settings). Always
  // sets an explicit choice, moving off 'system' if that was active — that's
  // what a quick top-of-screen toggle is for. Same persist-then-apply shape
  // as LanguageSection/AppearanceSection; writing through `updateSettings`
  // (rather than only local state) is what keeps this button and Settings'
  // own segmented control in sync via Dexie's live query.
  async function toggleTheme() {
    const next: ResolvedTheme = resolvedTheme === 'light' ? 'dark' : 'light'
    await updateSettings({ theme: next })
    applyTheme(next)
    setResolvedTheme(next)
  }

  const labels = {
    home: t('nav.home'),
    calculator: t('nav.calculator'),
    protocols: t('nav.protocols'),
    progress: t('nav.progress'),
    history: t('nav.history'),
    settings: t('nav.settings'),
  }

  if (gate === 'loading') {
    return <div className="min-h-dvh bg-background" />
  }

  if (gate === 'onboarding') {
    return (
      <OnboardingScreen
        onComplete={(protocolId) => {
          setGate('app')
          if (protocolId) openCalculatorFor(protocolId)
        }}
      />
    )
  }

  if (gate === 'legalReaccept') {
    return <LegalGate onAccept={() => setGate('app')} />
  }

  return (
    <div
      className="min-h-dvh bg-background pb-20"
      style={{ paddingTop: `calc(env(safe-area-inset-top) + ${APP_BAR_HEIGHT})` }}
    >
      <Toaster />
      <AppBar
        onBack={canGoBack ? () => backStack.back() : undefined}
        showActions={tab !== 'settings'}
        resolvedTheme={resolvedTheme}
        onToggleTheme={() => void toggleTheme()}
        onOpenSettings={() => goToTab('settings')}
      />
      <AnimatePresence mode="wait">
        <motion.div
          // The calculator opened for a different protocol is a fresh calculator.
          key={page.tab === 'calculator' ? `calculator:${page.protocolId ?? ''}` : tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {page.tab === 'home' && (
            <HomeScreen
              onNavigateToSettings={() => goToTab('settings')}
              onNavigateToProtocols={() => goToTab('protocols')}
              onNavigateToHistory={() => goToTab('history')}
              onNavigateToCalculator={() => goToTab('calculator')}
              onNavigateToProgress={() => goToTab('progress')}
              onOpenProtocol={openProtocolEditor}
            />
          )}
          {page.tab === 'calculator' && (
            <CalculatorScreen
              protocolId={page.protocolId}
              onCreateProtocol={(compoundId) => navigate({ tab: 'protocols', view: { kind: 'form', compoundId } })}
            />
          )}
          {page.tab === 'protocols' && (
            <ProtocolsScreen
              view={page.view}
              onNavigate={(view, leaving) => navigate({ tab: 'protocols', view }, leaving)}
              onBack={goBack}
              onReconstitute={openCalculatorFor}
            />
          )}
          {page.tab === 'progress' && <ProgressScreen />}
          {page.tab === 'history' && (
            <HistoryScreen
              editingId={page.editLogId}
              onEditLog={(editLogId) => navigate({ tab: 'history', editLogId })}
              onBack={() => goBack()}
              onOpenProtocol={openProtocolEditor}
            />
          )}
          {page.tab === 'settings' && <SettingsScreen />}
        </motion.div>
      </AnimatePresence>
      <TabBar active={tab} onChange={goToTab} labels={labels} navLabel={t('nav.ariaLabel')} />
    </div>
  )
}

export default App
