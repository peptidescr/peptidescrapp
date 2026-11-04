import { Calculator, Check, HeartPulse, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { HeroHeader, HeroOverlap } from '@/components/ui/hero-header'
import { InfoRowCard } from '@/components/ui/info-row-card'
import { SectionLabel } from '@/components/ui/section-label'
import { BRAND } from '@/brand'
import { BackupNudge } from '../components/BackupNudge'
import { HomeCommerceSlots } from '../components/HomeCommerceSlots'
import { PointsCard } from '../components/shop/LoyaltyCards'
import { NotificationPanel } from '../components/NotificationPanel'
import { VialAlertCard } from '../components/VialAlertCard'
import { formatDate } from '../lib/dates'
import { greetingKey } from '../lib/homeText'
import { useStoreAccount } from '../lib/store/account'
import type { GetStartedStepId } from '../lib/homeData'
import { useHomeState } from '../lib/useHomeState'
import type { ResolvedTheme } from '../lib/theme'
import { updateSettings } from '../lib/useSettings'
import { vialAlertKey } from '../lib/vials'

interface HomeScreenProps {
  /** The back arrow in the hero, when there is a page to go back to (Home has no app bar). */
  onBack?: () => void
  onNavigateToSettings: () => void
  onNavigateToProtocols: () => void
  onNavigateToCalculator: () => void
  onNavigateToProgress: () => void
  /** The points card and the credit banner (store features only). */
  onNavigateToRewards: () => void
  onNavigateToRefer: () => void
  /** Tapping a specific protocol (a vial alert): straight to its own edit page. */
  onOpenProtocol: (protocolId: string) => void
  /** The light/dark quick toggle in the hero; absent while theme switching is off. */
  onToggleTheme?: () => void
  resolvedTheme?: ResolvedTheme
}

/**
 * Home, as the approved screen has it: a hero band with the greeting, the bell
 * and Settings, the points card straddling its edge, Your usual, the credit
 * banner, then what needs a look (vial alerts), the calculator shortcut, and
 * the first-run and backup nudges. The store's parts (points, Your usual,
 * credit) show only when the store features are on. Doses are not here: taking
 * or skipping one, catching up, what's coming, streak and recent activity all
 * live in Track > Today, and the bell lists what is due.
 */
export function HomeScreen({
  onBack,
  onNavigateToSettings,
  onNavigateToProtocols,
  onNavigateToCalculator,
  onNavigateToProgress,
  onNavigateToRewards,
  onNavigateToRefer,
  onOpenProtocol,
  onToggleTheme,
  resolvedTheme,
}: HomeScreenProps) {
  const { t } = useTranslation()
  const home = useHomeState()
  const account = useStoreAccount()
  // The points card straddles the hero's edge, as on the approved screen; without an account (and with the
  // store features off) nothing does. Doses live in Track > Today, and the bell lists what is due.
  const pointsCard = BRAND.features.store ? account : null
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { now } = home

  return (
    <div className="pb-6">
      <HeroHeader
        overlap={pointsCard !== null}
        // With a signed-in store account the hero greets them by name, as the approved
        // screen does; without one there is no name, so the date sits above the greeting.
        greeting={account?.displayName ? `${t(greetingKey(now))},` : formatDate(now)}
        title={account?.displayName ?? t(greetingKey(now))}
        onBack={onBack}
        backLabel={t('common.back')}
        onOpenNotifications={() => setNotificationsOpen(true)}
        notificationLabel={t('settings.notifications')}
        hasUnread={home.notificationCount > 0}
        onOpenSettings={onNavigateToSettings}
        settingsLabel={t('nav.settings')}
        onToggleTheme={onToggleTheme}
        resolvedTheme={resolvedTheme}
        themeLabel={t('settings.appearance.quickToggle')}
      />

      {pointsCard && (
        <HeroOverlap>
          <PointsCard account={pointsCard} onOpen={onNavigateToRewards} />
        </HeroOverlap>
      )}

      <NotificationPanel
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        protocols={home.protocols ?? []}
        doseLogs={home.doseLogs ?? []}
        vialAlerts={home.vialAlerts}
        doseChanges={home.doseChanges}
        settings={home.settings}
        now={now}
        onNavigateToSettings={onNavigateToSettings}
        onOpenProtocol={onOpenProtocol}
      />

      <div className={`flex flex-col gap-4 px-4 ${pointsCard ? 'mt-[1.375rem]' : 'mt-6'}`}>
        <HomeCommerceSlots onOpenRefer={onNavigateToRefer} />

        {home.vialAlerts.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionLabel>{t('vialAlerts.title')}</SectionLabel>
            {home.vialAlerts.map((alert) => (
              <VialAlertCard key={vialAlertKey(alert)} alert={alert} onOpenProtocol={onOpenProtocol} />
            ))}
          </section>
        )}

        <InfoRowCard
          icon={Calculator}
          title={t('home.calculatorCardTitle')}
          subtitle={t('home.calculatorCardBody')}
          onClick={onNavigateToCalculator}
        />

        {home.activeProtocols.length > 0 && home.resultsToday === false && (
          <InfoRowCard
            tone="tint"
            icon={HeartPulse}
            title={t('progress.homePrompt')}
            onClick={onNavigateToProgress}
          />
        )}

        {home.showGetStarted && (
          <GetStartedChecklist
            steps={home.getStartedSteps}
            onNavigateToProtocols={onNavigateToProtocols}
            onNavigateToSettings={onNavigateToSettings}
            onNavigateToCalculator={onNavigateToCalculator}
            onDismiss={() => void updateSettings({ getStartedDismissedAt: new Date().toISOString() })}
          />
        )}

        {home.showBackupNudge && <BackupNudge onOpen={onNavigateToSettings} />}
      </div>
    </div>
  )
}

/**
 * First-run checklist. Only rendered while something is still outstanding and
 * the user hasn't dismissed it, so it disappears on its own rather than
 * becoming permanent furniture.
 */
function GetStartedChecklist({
  steps,
  onNavigateToProtocols,
  onNavigateToSettings,
  onNavigateToCalculator,
  onDismiss,
}: {
  steps: { id: GetStartedStepId; done: boolean }[]
  onNavigateToProtocols: () => void
  onNavigateToSettings: () => void
  onNavigateToCalculator: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const doneCount = steps.filter((s) => s.done).length

  const targets: Record<GetStartedStepId, () => void> = {
    createProtocol: onNavigateToProtocols,
    logDose: onNavigateToProtocols,
    tryCalculator: onNavigateToCalculator,
    backUp: onNavigateToSettings,
  }

  return (
    <Card padded className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-foreground">{t('home.getStartedTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {t('home.getStartedProgress', { done: doneCount, total: steps.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('home.getStartedDismiss')}
          className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={step.done ? undefined : targets[step.id]}
              disabled={step.done}
              className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  step.done ? 'border-primary bg-primary' : 'border-border'
                }`}
              >
                {step.done && <Check className="size-4 text-primary-foreground" />}
              </span>
              <span className={`text-sm ${step.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {t(`home.getStarted_${step.id}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
