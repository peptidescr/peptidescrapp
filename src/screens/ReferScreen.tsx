import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BRAND } from '@/brand'
import { buttonVariants } from '@/components/ui/button-variants'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StoreSignedOut } from '../components/shop/StoreSignIn'
import { formatPrice } from '../lib/shop/catalogue'
import { simulateReferrals, TEST_SIGN_IN, useStoreAccount, type StoreAccount } from '../lib/store/account'
import { tierRule } from '../lib/store/rules'
import { creditEarnedUsd, creditUnlockedByNext, ladderRows, nextMilestone, perksLine, tierName, type Rung, type StepState } from '../lib/store/loyaltyView'
import type { Locale } from '../lib/units'

/**
 * Refer & earn (Part B), under the store's referral rules (UPD's today: credit
 * per friend whose first app order is delivered, bonuses at milestones, a tier
 * at the last); the share link and activity come from the store; the friend
 * gets whatever the code already gives on the store; one reward per
 * order (an affiliate link wins). Reached from Home's credit banner and from
 * Rewards; it belongs to the Rewards tab.
 */
export function ReferScreen({ onUseCredit }: { onUseCredit: () => void }) {
  const { t } = useTranslation()
  const account = useStoreAccount()
  if (!account?.enabled) {
    return (
      <div className="px-4 pb-6">
        <h1 className="mb-4 font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('refer.title')}</h1>
        <StoreSignedOut />
      </div>
    )
  }
  return <ReferView account={account} onUseCredit={onUseCredit} />
}

// The rung to aim for is the soft amber of the app's other "plan for this" notices (vial alerts), which holds its
// contrast in both themes; the loud attention colour is for the Redeem button only.
const TAG_STYLE: Record<StepState, string> = {
  earned: 'bg-positive-lt text-positive',
  next: 'bg-brand-warn-lt text-brand-warn',
  locked: 'bg-tint text-muted-foreground',
}

const DOT_STYLE: Record<StepState, string> = {
  earned: 'border-primary bg-primary text-primary-foreground',
  next: 'border-brand-warn bg-brand-warn-lt text-brand-warn ring-4 ring-brand-warn/20',
  locked: 'border-border bg-card text-muted-foreground',
}

function ReferView({ account, onUseCredit }: { account: StoreAccount; onUseCredit: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language as Locale
  const usd = (amount: number) => formatPrice({ currency: 'USD', amount }, locale)
  const { referral } = account
  const next = nextMilestone(account)
  const unlocks = next ? creditUnlockedByNext(account) : 0
  const remaining = next?.remaining ?? 0
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const referralRules = account.rules.referral
  // The store's share link (UPD's opens its website until it points at the app).
  const url = referral.link ?? ''
  const shown = url.replace(/^https:\/\//, '')
  // The invite makes no offer: the friend gets whatever the code already gives on the store.
  const shareText = t('refer.shareText', { store: BRAND.store.name, link: url })
  const shareButton = cn(buttonVariants({ size: 'sm' }), 'h-12 min-h-12 rounded-xl text-sm font-semibold')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard blocked: the link is shown on screen to copy by hand.
    }
    setCopied(true)
    toast.success(t('refer.copiedToast'))
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  const stepSub = (rung: Rung): string => {
    if (rung.tier) {
      const name = tierName(rung.tier.tier, account.rules, t)
      const perks = perksLine(tierRule(account.rules, rung.tier.tier), t)
      return rung.tier.months !== undefined ? t('refer.step.tierFor', { tier: name, count: rung.tier.months, perks }) : t('refer.step.tier', { tier: name, perks })
    }
    if (rung.bonusUsd !== undefined) return t('refer.step.bonus', { amount: usd(rung.bonusUsd) })
    return t('refer.step.credit', { amount: usd(rung.creditUsd ?? 0) })
  }
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`))

  return (
    <div className="flex flex-col pb-6">
      <h1 className="px-4 pt-2 font-display text-[1.375rem] font-bold leading-tight text-foreground">{t('refer.title')}</h1>

      <section className="mx-4 mt-3 rounded-3xl bg-hero p-5 text-on-primary">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-on-primary-muted">{t('refer.creditEarned')}</p>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span className="font-display text-[3.5rem] font-bold leading-none tracking-tight tabular-nums">{usd(creditEarnedUsd(account))}</span>
          <span className="text-sm text-on-primary-muted">{t('refer.fromLabs', { count: referral.completed })}</span>
        </div>
        <div className="mt-[1.125rem] grid grid-cols-2 gap-2">
          <div className="rounded-[0.875rem] bg-on-primary-tile p-3">
            <p className="text-xs text-on-primary-muted">{t('refer.available')}</p>
            <p className="font-display text-xl font-bold tabular-nums">{usd(account.creditUsd)}</p>
          </div>
          {unlocks > 0 && (
            <div className="rounded-[0.875rem] bg-on-primary-tile p-3">
              <p className="text-xs text-on-primary-muted">{t('refer.unlocks', { count: remaining })}</p>
              <p className="font-display text-xl font-bold tabular-nums">+{usd(unlocks)}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onUseCredit}
          className="mt-3.5 flex h-[3.125rem] w-full items-center justify-center rounded-[0.875rem] bg-on-primary text-[15.5px] font-bold text-hero outline-none active:opacity-90 focus-visible:ring-2 focus-visible:ring-on-primary focus-visible:ring-offset-2 focus-visible:ring-offset-hero"
        >
          {t('refer.useCredit', { amount: usd(account.creditUsd) })}
        </button>
        <p className="mt-2 text-center text-xs text-on-primary-muted">{t('refer.creditNote')}</p>
      </section>

      {referralRules && (
      <section className="mx-4 mt-[1.375rem]">
        <h2 className="text-[17px] font-bold text-foreground">{t('refer.ladderTitle')}</h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {referralRules.minimumFirstOrderUsd !== undefined
            ? t('refer.ladderBody', { credit: usd(referralRules.creditPerReferralUsd), minimum: usd(referralRules.minimumFirstOrderUsd) })
            : t('refer.ladderBodyAny', { credit: usd(referralRules.creditPerReferralUsd) })}
        </p>
        <ol aria-label={t('refer.ladder')} className="mt-4 flex flex-col">
          {ladderRows(account).map(({ rung: step, state, toGo, lineFill }, index, rows) => (
            <li key={step.referrals} className="flex min-h-[4.125rem] gap-3.5">
              <div className="flex w-[1.875rem] shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'flex size-[1.875rem] items-center justify-center rounded-full border-2 text-[13px] font-bold',
                    DOT_STYLE[state],
                  )}
                >
                  {step.referrals}
                </span>
                {index < rows.length - 1 && (
                  <span aria-hidden className="relative w-[3px] flex-1 rounded-full bg-border">
                    <span className="absolute left-0 top-0 w-[3px] rounded-full bg-primary" style={{ height: `${lineFill * 100}%` }} />
                  </span>
                )}
              </div>
              <div className="flex flex-1 items-start justify-between gap-2.5 pb-3.5 pt-1">
                <div className="min-w-0">
                  <p className={cn('text-[15px] font-semibold leading-snug', state === 'locked' ? 'text-muted-foreground' : 'text-foreground')}>
                    {t('refer.step.title', { count: step.referrals })}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{stepSub(step)}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold leading-none', TAG_STYLE[state])}>
                  {state === 'earned' ? t('refer.step.tagEarned') : state === 'next' ? t('refer.step.tagToGo', { count: toGo }) : t('refer.step.tagLocked')}
                </span>
              </div>
            </li>
          ))}
        </ol>
        <p className="-mt-1 mb-3 text-xs leading-snug text-muted-foreground">{t('refer.affiliateNote')}</p>
      </section>
      )}

      {url && (
      <section className="mx-4 mt-1.5 rounded-[1.25rem] border border-border/60 bg-card p-4">
        <p className="text-[13px] text-muted-foreground">{t('refer.inviteLink')}</p>
        <div className="mt-2 flex gap-2">
          <div className="flex h-12 min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap rounded-xl bg-tint px-3.5 font-mono text-sm text-foreground">
            {shown}
          </div>
          <Button variant="secondary" className="h-12 shrink-0 border-2 border-primary px-4 text-sm text-primary" onClick={() => void copy()}>
            {copied ? t('refer.copied') : t('refer.copy')}
          </Button>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <a className={shareButton} href={`sms:?&body=${encodeURIComponent(shareText)}`} onClick={() => toast.success(t('refer.shareReady'))}>
            {t('refer.message')}
          </a>
          <a
            className={shareButton}
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => toast.success(t('refer.shareReady'))}
          >
            {t('refer.whatsapp')}
          </a>
          <a
            className={shareButton}
            href={`mailto:?subject=${encodeURIComponent(t('refer.shareSubject', { store: BRAND.store.name }))}&body=${encodeURIComponent(shareText)}`}
            onClick={() => toast.success(t('refer.shareReady'))}
          >
            {t('refer.email')}
          </a>
        </div>
      </section>
      )}

      {referral.activity.length > 0 && (
      <section className="mx-4 mt-3.5">
        <h2 className="mb-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('refer.activity')}</h2>
        <ul>
          {referral.activity.map((a) => (
            <li key={`${a.name}-${a.at}`} className="flex items-center justify-between gap-3 border-b border-border/60 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-foreground">{t(a.status === 'earned' ? 'refer.joined' : 'refer.invited', { name: a.name })}</p>
                <p className="text-[12.5px] text-muted-foreground">{t(a.status === 'earned' ? 'refer.firstShipped' : 'refer.waiting', { date: date(a.at) })}</p>
              </div>
              <span className={cn('shrink-0 font-bold', a.status === 'earned' ? 'text-positive' : 'text-muted-foreground')}>
                {a.status === 'earned' && a.amountUsd !== undefined ? `+${usd(a.amountUsd)}` : t('refer.pending')}
              </span>
            </li>
          ))}
        </ul>
      </section>
      )}

      {TEST_SIGN_IN && account.source === 'test' && <ReferralTestTools />}
    </div>
  )
}

/**
 * Staging only (the test account): a friend can't be referred for real yet, so this pretends one's first order was
 * paid and delivered, to try the ladder, the bonuses and Lab. Absent from a live-site build (TEST_SIGN_IN is off).
 */
function ReferralTestTools() {
  const { t } = useTranslation()
  return (
    <section className="mx-4 mt-4 rounded-[1.25rem] border-2 border-dashed border-border p-4">
      <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{t('refer.test.title')}</p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">{t('refer.test.body')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => simulateReferrals(1)}>
          {t('refer.test.add', { count: 1 })}
        </Button>
        <Button variant="secondary" onClick={() => simulateReferrals(5)}>
          {t('refer.test.add', { count: 5 })}
        </Button>
      </div>
    </section>
  )
}
