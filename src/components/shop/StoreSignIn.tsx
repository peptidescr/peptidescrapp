import { CircleAlert, ExternalLink, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BRAND } from '@/brand'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '../EmptyState'
import { signInTestAccount, signOutStore, TEST_SIGN_IN } from '../../lib/store/account'
import { ACCOUNT_PAGE_URL, signInStore, STORE_SIGN_IN, useStoreCustomer, type SignInResult } from '../../lib/store/session'

/**
 * Sign in with the store account (src/lib/store/session.ts): email and
 * password, sent straight to the store's sign-in service. Creating an account
 * and a forgotten password open the store's own My Account page.
 */
export function SignInSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="pr-14">
          <SheetTitle>{t('signIn.title', { store: BRAND.store.name })}</SheetTitle>
          <SheetDescription>{t('signIn.subtitle', { store: BRAND.store.name })}</SheetDescription>
        </SheetHeader>
        <SheetBody>{open && <SignInForm onDone={() => onOpenChange(false)} />}</SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function SignInForm({ onDone }: { onDone: () => void }) {
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
      {problem && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{t(`signIn.problem.${problem}`, { store: BRAND.store.name })}</span>
        </p>
      )}
      <Button type="submit" fullWidth disabled={!canSend}>
        {sending && <Loader2 className="animate-spin" />}
        {sending ? t('signIn.sending') : t('signIn.submit')}
      </Button>
      <div className="flex flex-wrap justify-center gap-x-2">
        <a href={ACCOUNT_PAGE_URL} target="_blank" rel="noopener noreferrer" className={link}>
          {t('signIn.forgot')}
          <ExternalLink />
        </a>
        <a href={ACCOUNT_PAGE_URL} target="_blank" rel="noopener noreferrer" className={link}>
          {t('signIn.create')}
          <ExternalLink />
        </a>
      </div>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">{t('signIn.sameAccount', { store: BRAND.store.name })}</p>
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
 * Rewards and Refer & earn without an account to show: signed out (with the
 * ways to sign in), or signed in with the store account before the store's
 * rewards are switched on.
 */
export function StoreSignedOut() {
  const { t } = useTranslation()
  const customer = useStoreCustomer()
  if (customer) {
    return (
      <EmptyState
        title={t('rewards.comingTitle')}
        body={t('rewards.comingBody', { email: customer.email, store: BRAND.store.name })}
        action={TEST_SIGN_IN ? <p className="text-xs text-muted-foreground">{t('rewards.comingTestHint')}</p> : undefined}
      />
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
