import { Bell, CalendarClock, ChevronLeft, FlaskConical, ShieldCheck, Smartphone, Syringe } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AppHeader } from '../components/AppHeader'
import { HowItWorksList } from '../components/HowItWorksList'
import { TemplatePicker } from '../components/TemplatePicker'
import { Button } from '@/components/ui/button'
import { OptionCard } from '@/components/ui/option-card'
import { Progress } from '@/components/ui/progress'
import { LEGAL_PLACEHOLDER, LEGAL_VERSION } from '../content/legal'
import type { ProtocolTemplate } from '../content/protocolTemplates'
import { useInstallState } from '../lib/install'
import { getNotificationCapability, requestNotificationPermission } from '../lib/notifications'
import type { Locale } from '../lib/units'
import { updateSettings } from '../lib/useSettings'
import { ProtocolForm } from './ProtocolsScreen'

type Step = 1 | 2 | 3 | 4 | 5 | 6
const TOTAL_STEPS = 6

export function OnboardingScreen({ onComplete }: { onComplete: (calculatorProtocolId?: string) => void }) {
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState<Step>(1)
  const locale = (i18n.language === 'en' ? 'en' : 'es-CR') as Locale

  // The last step (create a first protocol) has its own internal picker/form
  // sub-states, each of which renders its own AppHeader with a back chevron.
  // While either is showing, the outer wizard's back button + progress bar
  // are hidden — otherwise there'd be two back buttons on screen at once.
  const [innerStepOwnsHeader, setInnerStepOwnsHeader] = useState(false)
  const showChrome = !(step === 6 && innerStepOwnsHeader)

  function goBack() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s))
  }

  /** `calculatorProtocolId` is set when the user accepted the "reconstitute next" offer for their first protocol. */
  async function finishOnboarding(calculatorProtocolId?: string) {
    await updateSettings({ onboardingCompletedAt: new Date().toISOString() })
    onComplete(calculatorProtocolId)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      {showChrome && (
        <div className="mb-6 flex items-center gap-3">
          {/* Always rendered, invisible on step 1: the progress bar then
              keeps the same width and position on every step instead of
              jumping when the back button appears. */}
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            aria-hidden={step === 1}
            tabIndex={step === 1 ? -1 : 0}
            className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-primary ${
              step === 1 ? 'invisible' : ''
            }`}
          >
            <ChevronLeft className="size-6" />
          </button>
          <Progress
            value={step}
            max={TOTAL_STEPS}
            label={t('onboarding.progressLabel', { step, total: TOTAL_STEPS })}
            className="flex-1"
          />
        </div>
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="flex flex-1 flex-col"
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && <LanguageStep onNext={() => setStep(2)} />}
            {step === 2 && <HowItWorksStep onNext={() => setStep(3)} />}
            {step === 3 && <DisclaimerStep locale={locale} onAccept={() => setStep(4)} />}
            {step === 4 && <InstallStep onNext={() => setStep(5)} />}
            {step === 5 && <NotificationStep onNext={() => setStep(6)} />}
            {step === 6 && (
              <FirstProtocolStep
                onDone={(protocolId) => void finishOnboarding(protocolId)}
                onSkip={() => void finishOnboarding()}
                onHeaderModeChange={setInnerStepOwnsHeader}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Just the legal-acceptance content, exported so `App.tsx` can show it
 * standalone (no wizard chrome, no other steps) when `LEGAL_VERSION` has
 * been bumped for someone who already finished onboarding once — re-running
 * the whole wizard over a wording change would be a real regression, and is
 * exactly what the old `legalAcceptedVersion`-as-completion-flag caused.
 */
export function LegalGate({ onAccept }: { onAccept: () => void }) {
  const { i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'es-CR') as Locale
  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <DisclaimerStep locale={locale} onAccept={onAccept} />
    </div>
  )
}

/**
 * One wizard step: a hero (optional), a title, a short body, the content, and
 * a `footer` pinned to the bottom of the screen. Pinning the primary action
 * means it sits in the same place on every step — under the thumb — instead of
 * floating wherever the content happened to end.
 */
function StepShell({
  title,
  body,
  hero,
  footer,
  centered = false,
  children,
}: {
  title: string
  body?: string
  hero?: ReactNode
  footer?: ReactNode
  centered?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className={`flex flex-1 flex-col gap-4 ${centered ? 'items-center text-center' : ''}`}>
        {hero}
        <h1 className="font-display text-2xl font-bold leading-tight text-foreground">{title}</h1>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
        {children}
      </div>
      {footer && <div className="mt-auto flex flex-col gap-2 pt-8">{footer}</div>}
    </div>
  )
}

function LanguageStep({ onNext }: { onNext: () => void }) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState<Locale>((i18n.language === 'en' ? 'en' : 'es-CR') as Locale)

  // Switch immediately on tap, not deferred to Continue — matches Settings'
  // own LanguageSection, which already does this correctly. Deferring it
  // meant picking "English" only changed which card was highlighted; the
  // screen's own title/button stayed in Spanish until you left the step,
  // which reads as "it didn't actually switch."
  async function handleSelect(l: Locale) {
    setSelected(l)
    await updateSettings({ locale: l })
    await i18n.changeLanguage(l)
  }

  return (
    <StepShell
      centered
      title={t('onboarding.language.title')}
      hero={
        <img
          src="/brand/logo-full.png"
          alt="Peptides Costa Rica"
          className="mt-2 h-40 w-auto rounded-[2rem] shadow-[0_24px_64px_-24px_rgb(44_92_181/0.9)]"
        />
      }
      footer={<Button onClick={onNext}>{t('onboarding.continue')}</Button>}
    >
      <div className="flex w-full flex-col gap-2 text-left">
        {(['es-CR', 'en'] as const).map((l) => (
          <OptionCard
            key={l}
            label={l === 'es-CR' ? t('settings.spanish') : t('settings.english')}
            selected={selected === l}
            onSelect={() => void handleSelect(l)}
          />
        ))}
      </div>
    </StepShell>
  )
}

/**
 * The step that directly answers "no indication of how to work the
 * platform": one row per real feature, each using the same icon TabBar.tsx
 * uses for that tab, so this preview maps exactly onto the navigation the
 * user is about to land on. Content lives in HowItWorksList so Settings can
 * show the identical thing later, not a second copy that can drift.
 */
function HowItWorksStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()
  return (
    <StepShell
      title={t('onboarding.howItWorks.title')}
      body={t('onboarding.howItWorks.subtitle')}
      footer={<Button onClick={onNext}>{t('onboarding.continue')}</Button>}
    >
      <div className="mt-2">
        <HowItWorksList />
      </div>
    </StepShell>
  )
}

function DisclaimerStep({ locale, onAccept }: { locale: Locale; onAccept: () => void }) {
  const { t } = useTranslation()
  const legal = LEGAL_PLACEHOLDER[locale]

  async function handleAccept() {
    await updateSettings({ legalAcceptedVersion: LEGAL_VERSION, legalAcceptedAt: new Date().toISOString() })
    onAccept()
  }

  return (
    <StepShell
      title={legal.disclaimerTitle}
      footer={
        <>
          <p className="text-center text-xs text-muted-foreground">{t('onboarding.disclaimer.mustAccept')}</p>
          <Button onClick={handleAccept}>
            <ShieldCheck />
            {legal.acceptCta}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>{legal.disclaimerBody}</p>
        <p className="font-medium text-foreground">{legal.termsTitle}</p>
        <p>{legal.termsBody}</p>
      </div>
    </StepShell>
  )
}

function InstallStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()
  const install = useInstallState()

  return (
    <StepShell
      title={t('onboarding.install.title')}
      body={t('onboarding.install.body')}
      footer={<Button onClick={onNext}>{t('onboarding.continue')}</Button>}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <Smartphone className="size-4 text-primary" />
        </span>
        {install.isStandalone ? (
          <p className="pt-1.5">{t('settings.install.installed')}</p>
        ) : install.canPromptInstall ? (
          <p className="pt-1.5">{t('settings.install.available')}</p>
        ) : install.isIOS ? (
          <p className="pt-1.5">{t('settings.install.iosInstructions')}</p>
        ) : (
          <p className="pt-1.5">{t('settings.install.genericInstructions')}</p>
        )}
      </div>
      {!install.isStandalone && install.canPromptInstall && (
        <Button variant="secondary" onClick={() => void install.promptInstall()}>
          {t('settings.install.cta')}
        </Button>
      )}
    </StepShell>
  )
}

function NotificationStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()
  const [capability, setCapability] = useState(() => getNotificationCapability())

  async function handleEnable() {
    await requestNotificationPermission()
    setCapability(getNotificationCapability())
  }

  let statusKey = 'settings.notif.notSupported'
  if (capability.supported) {
    if (capability.requiresInstallOnIOS) statusKey = 'settings.notif.needsInstallIOS'
    else if (capability.permission === 'granted') statusKey = 'settings.notif.granted'
    else if (capability.permission === 'denied') statusKey = 'settings.notif.denied'
    else statusKey = 'settings.notif.notAsked'
  }

  return (
    <StepShell
      title={t('onboarding.notifications.title')}
      body={t('onboarding.notifications.body')}
      footer={<Button onClick={onNext}>{t('onboarding.continue')}</Button>}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <Bell className="size-4 text-primary" />
        </span>
        <p className="pt-1.5">{t(statusKey)}</p>
      </div>
      {capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default' && (
        <Button variant="secondary" onClick={handleEnable}>
          {t('settings.notif.enable')}
        </Button>
      )}
    </StepShell>
  )
}

/**
 * "A protocol is a compound, a dose, and a schedule" — drawn as the logo's own
 * three linked nodes, so the sentence above it is something you can see rather
 * than only read. The labels reuse the protocol form's own field names, so what
 * the diagram calls each part is exactly what the form will ask for next.
 */
function ProtocolAnatomy() {
  const { t } = useTranslation()
  const parts = [
    { icon: FlaskConical, label: t('protocols.compound') },
    { icon: Syringe, label: t('protocols.doseAmount') },
    { icon: CalendarClock, label: t('protocols.schedule') },
  ]
  return (
    <div className="flex flex-1 items-center justify-center pb-16" aria-hidden>
      <div className="flex items-start">
        {parts.map(({ icon: Icon, label }, i) => (
          <Fragment key={label}>
            {i > 0 && <span className="mt-[23px] h-0.5 w-5 shrink-0 rounded-full bg-border" />}
            <div className="flex w-20 flex-col items-center gap-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-xs font-medium leading-tight text-muted-foreground">{label}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

type FirstProtocolMode = 'intro' | 'picker' | { template?: ProtocolTemplate }

function FirstProtocolStep({
  onDone,
  onSkip,
  onHeaderModeChange,
}: {
  /** Finish onboarding; `protocolId` is passed when the user chose to reconstitute right away. */
  onDone: (protocolId?: string) => void
  onSkip: () => void
  /** Reported up so the outer wizard can hide its own back/progress row while this step shows its own. */
  onHeaderModeChange: (ownsHeader: boolean) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<FirstProtocolMode>('intro')

  useEffect(() => {
    onHeaderModeChange(mode !== 'intro')
  }, [mode, onHeaderModeChange])

  if (mode === 'picker') {
    return (
      <div className="flex flex-col gap-6">
        <AppHeader
          title={t('templates.pickerTitle')}
          onBack={() => setMode('intro')}
          backLabel={t('common.back')}
        />
        <TemplatePicker
          onSelectTemplate={(template) => setMode({ template })}
          onSelectCustom={() => setMode({ template: undefined })}
        />
      </div>
    )
  }

  if (mode !== 'intro') {
    return (
      <ProtocolForm
        template={mode.template}
        onDone={() => onDone()}
        onCancel={() => setMode('picker')}
        onReconstitute={onDone}
      />
    )
  }

  return (
    <StepShell
      title={t('onboarding.firstProtocol.title')}
      body={t('onboarding.firstProtocol.body')}
      footer={
        <>
          <Button onClick={() => setMode('picker')}>{t('onboarding.firstProtocol.cta')}</Button>
          <button type="button" onClick={onSkip} className="min-h-11 self-center text-sm text-muted-foreground">
            {t('onboarding.firstProtocol.skip')}
          </button>
        </>
      }
    >
      <ProtocolAnatomy />
    </StepShell>
  )
}
