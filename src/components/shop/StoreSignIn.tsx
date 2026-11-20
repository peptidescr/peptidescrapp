import { CircleAlert, ExternalLink, Loader2, MailCheck } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BRAND } from '@/brand'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '../EmptyState'
import { TurnstileWidget } from './Turnstile'
import { signInTestAccount, signOutStore, TEST_SIGN_IN } from '../../lib/store/account'
import {
  IN_APP_ACCOUNT_FORMS,
  MIN_PASSWORD,
  recoverStorePassword,
  registerStoreAccount,
  signUpProblem,
  validEmail,
  type SignUpField,
  type SignUpInput,
} from '../../lib/store/accountForms'
import { ACCOUNT_PAGE_URL, signInStore, STORE_SIGN_IN, useStoreCustomer, type SignInResult } from '../../lib/store/session'
import { refreshStoreRewards, useStoreRewards } from '../../lib/store/storeRewards'

export type AccountMode = 'signin' | 'signup' | 'recover'

/**
 * Sign in with the store account (src/lib/store/session.ts): email and
 * password, sent straight to the store's sign-in service. Creating an account
 * and resetting a password happen here too when the build has UPD's Turnstile
 * key (src/lib/store/accountForms.ts), else on the store's My Account page.
 */
export function SignInSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AccountMode>('signin')
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setMode('signin')
      }}
    >
      <SheetContent>
        <SheetHeader className="pr-14">
          <SheetTitle>{t(`signIn.titles.${mode}`, { store: BRAND.store.name })}</SheetTitle>
          <SheetDescription>{t(`signIn.subtitles.${mode}`, { store: BRAND.store.name })}</SheetDescription>
        </SheetHeader>
        <SheetBody>{open && <StoreAccountForms mode={mode} onMode={setMode} onSignedIn={() => onOpenChange(false)} />}</SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/** The three forms (sign in, create an account, reset the password), switching between them in place. */
export function StoreAccountForms({ mode, onMode, onSignedIn }: { mode: AccountMode; onMode: (mode: AccountMode) => void; onSignedIn: () => void }) {
  if (mode === 'signup') return <SignUpForm onBack={() => onMode('signin')} />
  if (mode === 'recover') return <RecoverForm onBack={() => onMode('signin')} />
  return <SignInForm onDone={onSignedIn} onMode={onMode} />
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function SignInForm({ onDone, onMode }: { onDone: () => void; onMode: (mode: AccountMode) => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<Exclude<SignInResult, 'ok'> | null>(null)
  const canSend = email.trim().includes('@') && password.length > 0 && !sending

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    setProblem(null)
    const result = await signInStore(email, password)
    setSending(false)
    if (result === 'ok') {
      // One account at a time: the staging test account steps aside.
      signOutStore()
      toast.success(t('signIn.done'))
      onDone()
      return
    }
    setProblem(result)
  }

  const link = buttonVariants({ variant: 'ghost', size: 'sm' })
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      <label className="flex flex-col gap-2">
        <span className="font-display text-sm font-semibold text-foreground">{t('signIn.email')}</span>
        <Input
          id="signin-email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          maxLength={254}
          onChange={(e) => {
            setEmail(e.target.value)
            setProblem(null)
          }}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-display text-sm font-semibold text-foreground">{t('signIn.password')}</span>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          maxLength={200}
          onChange={(e) => {
            setPassword(e.target.value)
            setProblem(null)
          }}
        />
      </label>
      {problem && <Problem>{t(`signIn.problem.${problem}`, { store: BRAND.store.name })}</Problem>}
      <Button type="submit" fullWidth disabled={!canSend}>
        {sending && <Loader2 className="animate-spin" />}
        {sending ? t('signIn.sending') : t('signIn.submit')}
      </Button>
      <div className="flex flex-wrap justify-center gap-x-2">
        {IN_APP_ACCOUNT_FORMS ? (
          <>
            <button type="button" className={link} onClick={() => onMode('recover')}>
              {t('signIn.forgot')}
            </button>
            <button type="button" className={link} onClick={() => onMode('signup')}>
              {t('signIn.create')}
            </button>
          </>
        ) : (
          <>
            <a href={ACCOUNT_PAGE_URL} target="_blank" rel="noopener noreferrer" className={link}>
              {t('signIn.forgot')}
              <ExternalLink />
            </a>
            <a href={ACCOUNT_PAGE_URL} target="_blank" rel="noopener noreferrer" className={link}>
              {t('signIn.create')}
              <ExternalLink />
            </a>
          </>
        )}
      </div>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {t(IN_APP_ACCOUNT_FORMS ? 'signIn.sameAccountInApp' : 'signIn.sameAccount', { store: BRAND.store.name })}
      </p>
    </form>
  )
}

/** "Check your email": after creating an account or asking for a reset. */
function Sent({ message, onBack }: { message: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
      <MailCheck aria-hidden className="size-10 text-primary" />
      <p className="text-sm leading-relaxed text-foreground">{message}</p>
      <Button variant="secondary" onClick={onBack}>
        {t('signIn.backToSignIn')}
      </Button>
    </div>
  )
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-display text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const EMPTY_SIGN_UP: SignUpInput = { fullName: '', email: '', phone: '', password: '', confirm: '', ack: false, marketingOptIn: false }

/** Creating an account, as on UPD's website, with the Turnstile check (action "signup"). */
function SignUpForm({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [input, setInput] = useState<SignUpInput>(EMPTY_SIGN_UP)
  const [showErrors, setShowErrors] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const bad = showErrors ? signUpProblem(input) : null
  const set = <K extends keyof SignUpInput>(key: K, value: SignUpInput[K]) => {
    setInput((i) => ({ ...i, [key]: value }))
    setProblem(null)
  }
  const error = (field: SignUpField) => (bad === field ? t(`signIn.signUpErrors.${field}`, { count: MIN_PASSWORD }) : undefined)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setShowErrors(true)
    const first = signUpProblem(input)
    if (first) {
      document.getElementById(`signup-${first}`)?.focus()
      return
    }
    if (!token || sending) return
    setSending(true)
    setProblem(null)
    const result = await registerStoreAccount(input, token)
    setSending(false)
    // A token works once: the next try needs a new check.
    setResetKey((k) => k + 1)
    if (result.ok) {
      setSent(result.message ?? t('signIn.signUpSent'))
      return
    }
    setProblem(result.offline ? t('signIn.problem.offline') : (result.message ?? t('signIn.signUpFailed', { store: BRAND.store.name })))
  }

  if (sent) return <Sent message={sent} onBack={onBack} />
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      <Field id="signup-fullName" label={t('signIn.fullName')} error={error('fullName')}>
        <Input id="signup-fullName" autoComplete="name" value={input.fullName} maxLength={100} onChange={(e) => set('fullName', e.target.value)} />
      </Field>
      <Field id="signup-email" label={t('signIn.email')} error={error('email')}>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={input.email}
          maxLength={254}
          onChange={(e) => set('email', e.target.value)}
        />
      </Field>
      <Field id="signup-phone" label={t('signIn.phoneOptional')}>
        <Input id="signup-phone" type="tel" autoComplete="tel" inputMode="tel" value={input.phone} maxLength={25} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field id="signup-password" label={t('signIn.newPassword')} hint={t('signIn.passwordHint', { count: MIN_PASSWORD })} error={error('password')}>
        <Input id="signup-password" type="password" autoComplete="new-password" value={input.password} maxLength={200} onChange={(e) => set('password', e.target.value)} />
      </Field>
      <Field id="signup-confirm" label={t('signIn.confirmPassword')} error={error('confirm')}>
        <Input id="signup-confirm" type="password" autoComplete="new-password" value={input.confirm} maxLength={200} onChange={(e) => set('confirm', e.target.value)} />
      </Field>
      <label className="flex min-h-11 shrink-0 items-start gap-3 rounded-xl bg-secondary p-3">
        <input
          id="signup-ack"
          type="checkbox"
          checked={input.ack}
          onChange={(e) => set('ack', e.target.checked)}
          aria-invalid={bad === 'ack' || undefined}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="text-sm leading-snug text-foreground">{t('signIn.ack')}</span>
      </label>
      {error('ack') && <p className="-mt-2 text-sm text-destructive">{error('ack')}</p>}
      <label className="flex min-h-11 shrink-0 items-start gap-3 py-1.5">
        <input type="checkbox" checked={input.marketingOptIn} onChange={(e) => set('marketingOptIn', e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span className="text-[13px] leading-snug text-muted-foreground">{t('signIn.marketing')}</span>
      </label>
      <TurnstileWidget action="signup" onToken={setToken} resetKey={resetKey} />
      {problem && <Problem>{problem}</Problem>}
      <Button type="submit" fullWidth disabled={sending || !token}>
        {sending && <Loader2 className="animate-spin" />}
        {sending ? t('signIn.creating') : t('signIn.createSubmit')}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="self-center" onClick={onBack}>
        {t('signIn.haveAccount')}
      </Button>
    </form>
  )
}

/** Asking for a password reset link, with the Turnstile check (action "recover"). */
function RecoverForm({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validEmail(email)) {
      setProblem(t('signIn.signUpErrors.email'))
      return
    }
    if (!token || sending) return
    setSending(true)
    setProblem(null)
    const result = await recoverStorePassword(email, token)
    setSending(false)
    setResetKey((k) => k + 1)
    if (result.ok) {
      // The same answer whether or not the account exists, as on UPD's website.
      setSent(t('signIn.recoverSent'))
      return
    }
    setProblem(result.offline ? t('signIn.problem.offline') : (result.message ?? t('signIn.recoverFailed')))
  }

  if (sent) return <Sent message={sent} onBack={onBack} />
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      <Field id="recover-email" label={t('signIn.email')}>
        <Input
          id="recover-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          maxLength={254}
          onChange={(e) => {
            setEmail(e.target.value)
            setProblem(null)
          }}
        />
      </Field>
      <TurnstileWidget action="recover" onToken={setToken} resetKey={resetKey} />
      {problem && <Problem>{problem}</Problem>}
      <Button type="submit" fullWidth disabled={sending || !token}>
        {sending && <Loader2 className="animate-spin" />}
        {sending ? t('signIn.recoverSending') : t('signIn.recoverSubmit')}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="self-center" onClick={onBack}>
        {t('signIn.backToSignIn')}
      </Button>
    </form>
  )
}

/**
 * The buttons that sign in: the store account (when this build has it) and, on
 * staging, the test account. Renders nothing when neither exists.
 */
export function SignInButtons({ className = 'flex flex-col items-center gap-2' }: { className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!STORE_SIGN_IN && !TEST_SIGN_IN) return null
  return (
    <div className={className}>
      {STORE_SIGN_IN && <Button onClick={() => setOpen(true)}>{t('signIn.open')}</Button>}
      {TEST_SIGN_IN && (
        <Button variant={STORE_SIGN_IN ? 'secondary' : 'primary'} onClick={signInTestAccount}>
          {t('account.testSignIn')}
        </Button>
      )}
      {STORE_SIGN_IN && <SignInSheet open={open} onOpenChange={setOpen} />}
    </div>
  )
}

/**
 * Rewards and Refer & earn without rewards to show: the store has them
 * switched off; or signed in and they're not set up on the store yet, loading,
 * couldn't be read, or the sign-in expired; or signed out (with the ways to
 * sign in).
 */
export function StoreSignedOut() {
  const { t } = useTranslation()
  const customer = useStoreCustomer()
  const rewards = useStoreRewards()
  const [open, setOpen] = useState(false)
  if (rewards.account && !rewards.account.enabled) {
    return <EmptyState title={t('rewards.offTitle')} body={t('rewards.offBody', { store: BRAND.store.name })} />
  }
  if (customer) {
    if (rewards.status === 'not-set-up') {
      return <EmptyState title={t('rewards.notSetUpTitle')} body={t('rewards.notSetUpBody', { store: BRAND.store.name })} />
    }
    if (rewards.status === 'expired') {
      return (
        <EmptyState
          title={t('rewards.expiredTitle')}
          body={t('rewards.expiredBody', { store: BRAND.store.name })}
          action={
            <>
              <Button onClick={() => setOpen(true)}>{t('signIn.open')}</Button>
              <SignInSheet open={open} onOpenChange={setOpen} />
            </>
          }
        />
      )
    }
    if (rewards.status === 'unavailable') {
      return (
        <EmptyState
          title={t('rewards.unavailableTitle')}
          body={t('rewards.unavailableBody', { store: BRAND.store.name })}
          action={
            <Button variant="secondary" onClick={() => void refreshStoreRewards({ force: true, customer })}>
              {t('rewards.tryAgain')}
            </Button>
          }
        />
      )
    }
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-6 animate-spin text-primary" />
        {t('rewards.loading')}
      </div>
    )
  }
  return (
    <EmptyState
      title={t('rewards.signedOutTitle')}
      body={t(STORE_SIGN_IN ? 'rewards.signedOutStoreBody' : TEST_SIGN_IN ? 'rewards.signedOutTestBody' : 'rewards.signedOutBody', { store: BRAND.store.name })}
      action={<SignInButtons />}
    />
  )
}
