import { ChevronRight, UserPlus } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { InfoRowCard } from '@/components/ui/info-row-card'
import { ProgressRing } from '@/components/ui/progress-ring'
import type { StoreAccount } from '../../lib/store/account'
import { nextStep, ringProgress } from '../../lib/store/loyaltyView'
import { formatPrice } from '../../lib/shop/catalogue'
import type { Locale } from '../../lib/units'

/**
 * The points ring card of the approved Home screen: the balance in a ring that
 * fills towards the next tier, the tier badge, "$62 away from Lab tier" and what
 * Lab unlocks. Opens Rewards. Shown only for a signed-in customer (see
 * src/lib/store/account.ts).
 */
export function PointsCard({ account, onOpen }: { account: StoreAccount; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const progress = ringProgress(account)
  const nextName = account.next ? t(`loyalty.tierName.${account.next.id}`) : undefined
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 text-left shadow-card outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProgressRing
        value={progress}
        size={84}
        strokeWidth={9}
        label={t('loyalty.ringLabel', { points: account.points.toLocaleString(locale), percent: Math.round(progress * 100), tier: nextName ?? t(`loyalty.tierName.${account.tier}`) })}
      >
        <span className="font-display text-xl font-bold leading-none tabular-nums text-foreground">{account.points.toLocaleString(locale)}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{t('loyalty.ringCaption')}</span>
      </ProgressRing>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="rounded-full bg-tint px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.1em] text-primary">
          {t('loyalty.tierBadge', { tier: t(`loyalty.tierName.${account.tier}`) })}
        </span>
        {account.next && (
          <>
            <span className="text-[15px] font-semibold leading-snug text-foreground">
              <Trans
                i18nKey="loyalty.awayFrom"
                values={{ amount: formatPrice({ currency: 'USD', amount: account.next.aboutOrdersUsd }, locale), tier: nextName }}
                components={{ b: <b /> }}
              />
            </span>
            <span className="text-[12.5px] leading-snug text-muted-foreground">{t(`loyalty.unlock.${account.next.unlockKey}`)}</span>
          </>
        )}
      </span>
      <ChevronRight aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
    </button>
  )
}

/** "$45 credit ready to use / Refer 2 more labs to unlock $50 extra": the tinted banner under Your usual. Opens Refer & earn. */
export function CreditBanner({ account, onOpen }: { account: StoreAccount; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  if (account.creditUsd <= 0) return null
  const step = nextStep(account)
  const remaining = step ? step.referrals - account.referral.completed : 0
  return (
    <InfoRowCard
      tone="tint"
      iconTone="primary"
      icon={UserPlus}
      title={t('loyalty.creditReady', { amount: formatPrice({ currency: 'USD', amount: account.creditUsd }, locale) })}
      subtitle={
        step?.bonusUsd
          ? t('loyalty.creditMore', { count: remaining, amount: formatPrice({ currency: 'USD', amount: step.bonusUsd }, locale) })
          : undefined
      }
      onClick={onOpen}
    />
  )
}
