import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'
import { TemplatePicker } from '../components/TemplatePicker'
import { LEGAL_PLACEHOLDER, LEGAL_VERSION } from '../content/legal'
import type { ProtocolTemplate } from '../content/protocolTemplates'
import { useInstallState } from '../lib/install'
import { getNotificationCapability, requestNotificationPermission } from '../lib/notifications'
import type { Locale } from '../lib/units'
import { updateSettings } from '../lib/useSettings'
import { ProtocolForm } from './ProtocolsScreen'

type Step = 1 | 2 | 3 | 4 | 5

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>(1)
  const { i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'es-CR') as Locale

  return (
    <div className="flex min-h-dvh flex-col bg-brand-surface-2 px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <StepDots step={step} />
      <div className="flex-1">
        {step === 1 && <LanguageStep onNext={() => setStep(2)} />}
        {step === 2 && <DisclaimerStep locale={locale} onAccept={() => setStep(3)} />}
        {step === 3 && <InstallStep onNext={() => setStep(4)} />}
        {step === 4 && <NotificationStep onNext={() => setStep(5)} />}
        {step === 5 && <FirstProtocolStep onDone={onComplete} onSkip={onComplete} />}
      </div>
    </div>
  )
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="mb-6 flex justify-center gap-2">
      {([1, 2, 3, 4, 5] as Step[]).map((s) => (
        <span
          key={s}
          className={`h-1.5 w-6 rounded-full ${s <= step ? 'bg-brand-primary' : 'bg-brand-border'}`}
        />
      ))}
    </div>
  )
}

function StepShell({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-brand-ink">{title}</h1>
      {body && <p className="text-sm text-brand-muted">{body}</p>}
      {children}
    </div>
  )
}

function LanguageStep({ onNext }: { onNext: () => void }) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState<Locale>((i18n.language === 'en' ? 'en' : 'es-CR') as Locale)

  async function handleNext() {
    await updateSettings({ locale: selected })
    await i18n.changeLanguage(selected)
    onNext()
  }

  return (
    <StepShell title={t('onboarding.language.title')}>
      <img src="/brand/logo-full.png" alt="Peptides Costa Rica" className="mx-auto h-16 w-auto" />
      <div className="flex flex-col gap-2">
        {(['es-CR', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setSelected(l)}
            className={`min-h-11 rounded-xl border px-4 text-left text-base font-medium ${
              selected === l
                ? 'border-brand-primary bg-brand-primary-lt text-brand-primary'
                : 'border-brand-border text-brand-ink'
            }`}
          >
            {l === 'es-CR' ? 'Español (Costa Rica)' : 'English'}
          </button>
        ))}
      </div>
      <Button onClick={handleNext} className="mt-4">
        {t('onboarding.continue')}
      </Button>
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
    <StepShell title={legal.disclaimerTitle}>
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto rounded-xl border border-brand-border bg-brand-surface p-4 text-sm text-brand-muted">
        <p>{legal.disclaimerBody}</p>
        <p className="font-medium text-brand-ink">{legal.termsTitle}</p>
        <p>{legal.termsBody}</p>
      </div>
      <p className="text-xs text-brand-muted">{t('onboarding.disclaimer.mustAccept')}</p>
      <Button onClick={handleAccept} className="mt-2">
        {legal.acceptCta}
      </Button>
    </StepShell>
  )
}

function InstallStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation()
  const install = useInstallState()

  return (
    <StepShell title={t('onboarding.install.title')} body={t('onboarding.install.body')}>
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-sm text-brand-muted">
        {install.isStandalone ? (
          <p>{t('settings.install.installed')}</p>
        ) : install.canPromptInstall ? (
          <p>{t('settings.install.available')}</p>
        ) : install.isIOS ? (
          <p>{t('settings.install.iosInstructions')}</p>
        ) : (
          <p>{t('settings.install.genericInstructions')}</p>
        )}
      </div>
      {!install.isStandalone && install.canPromptInstall && (
        <Button variant="secondary" onClick={() => void install.promptInstall()}>
          {t('settings.install.cta')}
        </Button>
      )}
      <Button onClick={onNext} className="mt-2">
        {t('onboarding.continue')}
      </Button>
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
    <StepShell title={t('onboarding.notifications.title')} body={t('onboarding.notifications.body')}>
      <p className="rounded-xl border border-brand-border bg-brand-surface p-4 text-sm text-brand-muted">
        {t(statusKey)}
      </p>
      {capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default' && (
        <Button variant="secondary" onClick={handleEnable}>
          {t('settings.notif.enable')}
        </Button>
      )}
      <Button onClick={onNext} className="mt-2">
        {t('onboarding.continue')}
      </Button>
    </StepShell>
  )
}

type FirstProtocolMode = 'intro' | 'picker' | { template?: ProtocolTemplate }

function FirstProtocolStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<FirstProtocolMode>('intro')

  if (mode === 'picker') {
    return (
      <TemplatePicker
        onSelectTemplate={(template) => setMode({ template })}
        onSelectCustom={() => setMode({ template: undefined })}
      />
    )
  }

  if (mode !== 'intro') {
    return <ProtocolForm template={mode.template} onDone={onDone} />
  }

  return (
    <StepShell title={t('onboarding.firstProtocol.title')} body={t('onboarding.firstProtocol.body')}>
      <Button onClick={() => setMode('picker')}>{t('onboarding.firstProtocol.cta')}</Button>
      <button type="button" onClick={onSkip} className="min-h-11 self-center text-sm text-brand-muted">
        {t('onboarding.firstProtocol.skip')}
      </button>
    </StepShell>
  )
}
