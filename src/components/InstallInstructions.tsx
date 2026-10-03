import { Check, Menu, MoreVertical, Share, Smartphone, SquarePlus, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useInstallState } from '../lib/install'

interface StepRow {
  icon: LucideIcon
  textKey: string
}

const IOS_STEPS: StepRow[] = [
  { icon: Share, textKey: 'settings.install.ios.step1' },
  { icon: SquarePlus, textKey: 'settings.install.ios.step2' },
  { icon: Check, textKey: 'settings.install.ios.step3' },
]

// MoreVertical matches Chrome's actual three-dot menu glyph, and is the
// same icon this app already uses elsewhere for an overflow menu — so it
// reads as "that menu", not an arbitrary icon choice.
const ANDROID_STEPS: StepRow[] = [
  { icon: MoreVertical, textKey: 'settings.install.android.step1' },
  { icon: SquarePlus, textKey: 'settings.install.android.step2' },
  { icon: Check, textKey: 'settings.install.android.step3' },
]

// Any other browser (desktop Firefox/Safari, or a Chromium browser whose
// native prompt isn't available right now) — can't name one exact menu
// item across all of them, so step 1 stays broad ("your browser's menu,
// or the address bar") rather than a specific path that might not exist.
// step2/step3 reuse the same icons as iOS/Android on purpose: "add" and
// "confirm" look the same regardless of platform.
const GENERIC_STEPS: StepRow[] = [
  { icon: Menu, textKey: 'settings.install.generic.step1' },
  { icon: SquarePlus, textKey: 'settings.install.generic.step2' },
  { icon: Check, textKey: 'settings.install.generic.step3' },
]

/**
 * "How do I install this" — reused in Onboarding's install step and
 * Settings' Install section (same pattern as HowItWorksList: one component,
 * shown from two entry points, so the copy can't drift between them).
 *
 * Branches on useInstallState() to show only the one path that applies to
 * the visitor's actual device — an installed/available/iOS/Android/generic
 * union would either show wrong steps or make them find their own among
 * several. Every non-native-prompt path (iOS, Android, and any other
 * browser) gets the same short numbered walkthrough: a themed lucide icon
 * per step (no raw emoji — every other icon in this app is a lucide icon,
 * and emoji render inconsistently in weight and color across platforms in
 * a way a numbered list here would show up plainly), ending in the same
 * add/confirm icons across all three so the shape reads as one pattern.
 */
export function InstallInstructions({
  buttonVariant = 'primary',
}: {
  /**
   * The native-prompt install button's variant. Onboarding passes
   * 'secondary' — its StepShell already has its own primary "Continue"
   * button below, and a second primary-colored button here would compete
   * with it. Settings' Install section has no such competing CTA, so the
   * default primary is right there.
   */
  buttonVariant?: ButtonProps['variant']
}) {
  const { t } = useTranslation()
  const install = useInstallState()

  if (install.isStandalone) {
    return <SimpleMessage>{t('settings.install.installed')}</SimpleMessage>
  }

  if (install.canPromptInstall) {
    return (
      <div className="flex flex-col gap-3">
        <SimpleMessage>{t('settings.install.available')}</SimpleMessage>
        <Button variant={buttonVariant} onClick={() => void install.promptInstall()} className="self-start">
          {t('settings.install.cta')}
        </Button>
      </div>
    )
  }

  if (install.isIOS) {
    return <StepList titleKey="settings.install.ios.title" footerKey="settings.install.ios.footer" steps={IOS_STEPS} />
  }

  if (install.isAndroid) {
    return (
      <StepList titleKey="settings.install.android.title" footerKey="settings.install.android.footer" steps={ANDROID_STEPS} />
    )
  }

  return (
    <StepList titleKey="settings.install.generic.title" footerKey="settings.install.generic.footer" steps={GENERIC_STEPS} />
  )
}

function SimpleMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm text-muted-foreground">
      <IconBadge icon={Smartphone} />
      <p className="pt-1.5">{children}</p>
    </div>
  )
}

function StepList({ titleKey, footerKey, steps }: { titleKey: string; footerKey: string; steps: StepRow[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium text-foreground">{t(titleKey)}</p>
      <ol className="flex flex-col gap-3">
        {steps.map(({ icon, textKey }, index) => (
          <li key={textKey} className="flex items-start gap-3">
            <IconBadge icon={icon} />
            <span className="pt-1.5 text-sm text-foreground">
              <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
              {t(textKey)}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">{t(footerKey)}</p>
    </div>
  )
}

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
      <Icon className="size-4 text-primary" />
    </span>
  )
}
