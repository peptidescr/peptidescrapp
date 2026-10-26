import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { APP_BAR_HEIGHT, AppBar } from './components/AppBar'
import { TabBar } from './components/TabBar'
import { Toaster } from './components/ui/sonner'
import { LEGAL_VERSION } from './content/legal'
import { BRAND } from './brand'
import { maybeCreateDailySnapshot } from './lib/backup'
import { backStack } from './lib/backStack'
import { pageForTarget, takeOpenTarget } from './lib/deepLinks'
import {
  HOME,
  popPage,
  pushPage,
  reachablePage,
  replacePage,
  segmentOf,
  tabOf,
  tabPage,
  trackPage,
  visibleTabs,
  type Page,
  type Tab,
  type TrackSegment,
} from './lib/pages'
import { db, ensureCompoundsSeeded, ensureSettingsRow } from './lib/db'
import { useCustomCompoundsLoaded } from './lib/customCompounds'
import { startStoreCatalogueRefresh, syncStoreCatalogue, useStoreCompoundsLoaded } from './lib/storeCatalogue'
import { DEFAULT_LOCALE, toSupportedLocale } from './i18n'
import { scheduleUpcomingReminders, startReminderLoop } from './lib/notifications'
import { THEME_SWITCHING_ENABLED } from './lib/theme'
import { useTheme } from './lib/useTheme'
import { updateSettings, useSettings } from './lib/useSettings'
import { HomeScreen } from './screens/HomeScreen'
import { CalculatorScreen } from './screens/CalculatorScreen'
import { LegalGate, OnboardingScreen } from './screens/OnboardingScreen'
import { ProtocolsScreen } from './screens/ProtocolsScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { RewardsScreen } from './screens/RewardsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ShopScreen } from './screens/ShopScreen'
import { TodayView } from './screens/TodayView'
import { ToolsScreen } from './screens/ToolsScreen'
import { TrackScreen } from './screens/TrackScreen'

type Gate = 'loading' | 'onboarding' | 'legalReaccept' | 'app'

const STORE_ENABLED = BRAND.features.store

/**
 * The pages to start on. Normally just Home; a cold start from a tapped
 * notification carries `?open=<target>` (public/shared/sw-notifications.js), and
 * then that page sits on top of Home, so back still goes Home.
 */
function initialPages(): Page[] {
  if (typeof window === 'undefined') return [HOME]
  const target = pageForTarget(takeOpenTarget(window.location.search).target)
  return target ? [HOME, reachablePage(target, STORE_ENABLED)] : [HOME]
}

function App() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()

  // Every page visited, newest last; the last one is what's showing. Back
  // (the app bar's arrow, or the phone's or browser's own back, through
  // backStack) returns to the one before. See src/lib/pages.ts.
  const [pages, setPages] = useState<Page[]>(initialPages)
  const page = pages[pages.length - 1]!
  const tab = tabOf(page)

  // Where each page in the history was scrolled to when it was left, so back
  // returns to the same spot. Indexed like `pages`.
  const scrollMemory = useRef<number[]>([])
  const lastMove = useRef<'push' | 'pop' | null>(null)
  // The segment Track was last left on, so the Track tab returns to it.
  const trackSegment = useRef<TrackSegment>('today')
  const currentSegment = segmentOf(page)
  useEffect(() => {
    if (currentSegment) trackSegment.current = currentSegment
  }, [currentSegment])

  const navigate = useCallback(
    (next: Page, leaving?: (page: Page) => boolean) => {
      scrollMemory.current[pages.length - 1] = window.scrollY
      lastMove.current = 'push'
      setPages((current) => pushPage(current, reachablePage(next, STORE_ENABLED), leaving))
    },
    [pages.length],
  )

  /** Switching segment inside Track swaps the page instead of adding one, so back leaves Track. */
  function selectSegment(segment: TrackSegment) {
    lastMove.current = 'push'
    setPages((current) => replacePage(current, trackPage(segment)))
  }

  const goBack = useCallback((skipping?: (page: Page) => boolean) => {
    lastMove.current = 'pop'
    setPages((current) => popPage(current, skipping))
  }, [])

  const canGoBack = pages.length > 1
  useEffect(() => {
    backStack.setPageBack(canGoBack ? () => goBack() : null)
  }, [canGoBack, goBack])

  // Tapping a notification while the app is already open: the service worker
  // sends a message naming where to go (see src/lib/deepLinks.ts). The cold-start
  // case rides in the URL and is handled by initialPages, which this tidies up.
  useEffect(() => {
    const { remaining } = takeOpenTarget(window.location.search)
    if (remaining !== window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname + remaining + window.location.hash)
    }
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'open') return
      const target = pageForTarget(event.data.target)
      if (target) navigate(target)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

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
    navigate({ tab: 'tools', tool: 'calculator', protocolId }, leaving)
  }

  /** Tapping a protocol on Home or in History — straight to that protocol's own edit page. */
  function openProtocolEditor(protocolId: string) {
    navigate({ tab: 'track', segment: 'protocols', view: { kind: 'form', protocolId } })
  }

  /** A tab-bar tap. Tapping the tab already showing just returns to the top of it. */
  function goToTab(next: Tab) {
    if (tab === next) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    navigate(tabPage(next, trackSegment.current))
  }

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

  // 'system' (the default) follows the device; the quick toggle in the app bar
  // flips between light and dark. See src/lib/useTheme.ts.
  const resolvedTheme = useTheme(settings ? (settings.theme ?? 'system') : undefined)
  const toggleTheme = THEME_SWITCHING_ENABLED
    ? () => void updateSettings({ theme: resolvedTheme === 'light' ? 'dark' : 'light' })
    : undefined

  const labels: Record<Tab, string> = {
    home: t('nav.home'),
    track: t('nav.track'),
    shop: t('nav.shop'),
    rewards: t('nav.rewards'),
    tools: t('nav.tools'),
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

  // Home's hero band carries the back arrow, the bell and Settings itself, so the
  // app bar is everywhere else.
  const showAppBar = page.tab !== 'home'
  const backArrow = canGoBack ? () => backStack.back() : undefined

  // What animates between pages: a tab, or a segment inside Track, or the tool open.
  const pageKey =
    page.tab === 'track'
      ? `track:${page.segment}`
      : page.tab === 'tools'
        ? `tools:${page.tool}:${page.protocolId ?? ''}`
        : page.tab

  return (
    <div
      className="min-h-dvh bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]"
      style={{ paddingTop: showAppBar ? `calc(env(safe-area-inset-top) + ${APP_BAR_HEIGHT})` : undefined }}
    >
      <Toaster />
      {showAppBar && (
        <AppBar
          onBack={backArrow}
          showActions={page.tab !== 'settings'}
          resolvedTheme={resolvedTheme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => navigate(tabPage('settings'))}
        />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={pageKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
        >
          {page.tab === 'home' && (
            <HomeScreen
              onBack={backArrow}
              onNavigateToSettings={() => navigate(tabPage('settings'))}
              onNavigateToToday={() => navigate(trackPage('today'))}
              onNavigateToProtocols={() => navigate(trackPage('protocols'))}
              onNavigateToCalculator={() => navigate(tabPage('tools'))}
              onNavigateToProgress={() => navigate(trackPage('progress'))}
              onOpenProtocol={openProtocolEditor}
            />
          )}
          {page.tab === 'track' && (
            <TrackScreen page={page} onSelectSegment={selectSegment}>
              {page.segment === 'today' && (
                <div className="px-4 pb-6">
                  <TodayView
                    onNavigateToProtocols={() => selectSegment('protocols')}
                    onNavigateToHistory={() => selectSegment('history')}
                    onNavigateToProgress={() => selectSegment('progress')}
                    onOpenProtocol={openProtocolEditor}
                  />
                </div>
              )}
              {page.segment === 'protocols' && (
                <ProtocolsScreen
                  view={page.view}
                  onNavigate={(view, leaving) => navigate({ tab: 'track', segment: 'protocols', view }, leaving)}
                  onBack={goBack}
                  onReconstitute={openCalculatorFor}
                />
              )}
              {page.segment === 'history' && (
                <HistoryScreen
                  editingId={page.editLogId}
                  onEditLog={(editLogId) => navigate({ tab: 'track', segment: 'history', editLogId })}
                  onBack={() => goBack()}
                  onOpenProtocol={openProtocolEditor}
                />
              )}
              {page.segment === 'progress' && <ProgressScreen />}
            </TrackScreen>
          )}
          {page.tab === 'tools' && (
            <ToolsScreen tool={page.tool} onSelectTool={(tool) => navigate({ tab: 'tools', tool })}>
              <CalculatorScreen
                protocolId={page.protocolId}
                onCreateProtocol={(compoundId) =>
                  navigate({ tab: 'track', segment: 'protocols', view: { kind: 'form', compoundId } })
                }
                // Only the new-protocol flow (save, then reconstitute) ends at Home,
                // with its pages dropped so back doesn't return into it; opening the
                // calculator on its own stays where the user put it.
                onSavedToProtocol={page.protocolId ? () => navigate(HOME, (p) => p.tab !== 'home') : undefined}
              />
            </ToolsScreen>
          )}
          {page.tab === 'shop' && <ShopScreen />}
          {page.tab === 'rewards' && <RewardsScreen />}
          {page.tab === 'settings' && <SettingsScreen />}
        </motion.div>
      </AnimatePresence>
      <TabBar
        tabs={visibleTabs(STORE_ENABLED)}
        active={tab}
        onChange={goToTab}
        labels={labels}
        navLabel={t('nav.ariaLabel')}
      />
    </div>
  )
}

export default App
