import { Calculator, ClipboardList, History, Home, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface FeatureRow {
  icon: LucideIcon
  titleKey: string
  bodyKey: string
}

// The same icon per feature that TabBar.tsx uses for that tab, so this list
// maps 1:1 onto the real bottom navigation the user is about to see — the
// whole point of this content existing (see the "why" in OnboardingScreen).
const FEATURES: FeatureRow[] = [
  {
    icon: Calculator,
    titleKey: 'onboarding.howItWorks.calculatorTitle',
    bodyKey: 'onboarding.howItWorks.calculatorBody',
  },
  {
    icon: ClipboardList,
    titleKey: 'onboarding.howItWorks.protocolsTitle',
    bodyKey: 'onboarding.howItWorks.protocolsBody',
  },
  {
    icon: Home,
    titleKey: 'onboarding.howItWorks.homeTitle',
    bodyKey: 'onboarding.howItWorks.homeBody',
  },
  {
    icon: History,
    titleKey: 'onboarding.howItWorks.historyTitle',
    bodyKey: 'onboarding.howItWorks.historyBody',
  },
]

/**
 * "What does this app actually do" — shown once during onboarding
 * (`OnboardingScreen`'s how-it-works step) and reachable any time after from
 * Settings, so it's a reference, not a one-time thing you can only half-read
 * on your way past it. Same component, same copy, two entry points.
 *
 * Purely functional descriptions, no invented ratings or user counts — the
 * app hasn't shipped yet, and this project doesn't fabricate numbers (see
 * NOTES.md's honesty constraints throughout).
 */
export function HowItWorksList() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
        <div key={titleKey} className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
            <Icon className="size-4 text-primary" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-foreground">{t(titleKey)}</p>
            <p className="text-sm text-muted-foreground">{t(bodyKey)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
