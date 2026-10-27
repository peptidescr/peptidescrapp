import { CheckCircle2, CircleAlert, ExternalLink, Loader2, MessageCircle, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BRAND } from '@/brand'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Stepper } from '@/components/ui/stepper'
import { clearCart, MAX_LINE_QTY, setCartQuantity, useCart, viewCart } from '../../lib/shop/cart'
import { formatPrice, type ShopProduct } from '../../lib/shop/catalogue'
import {
  emptyCheckoutForm,
  firstInvalidField,
  paymentMethodsFor,
  placeOrder,
  savePlacedOrder,
  type CheckoutField,
  type CheckoutForm,
  type OrderTotals,
  type PlacedOrder,
} from '../../lib/shop/checkout'
import { useOrderPaid } from '../../lib/shop/useOrderPaid'
import type { Locale } from '../../lib/units'

type Step = 'cart' | 'details' | 'result'

/** What went wrong with the last attempt, shown above the button. */
type Problem = { kind: 'refused'; message?: string } | { kind: 'notSent' } | { kind: 'off' } | { kind: 'invalid' }

/**
 * The cart, the customer's details and the placed order, in one sheet (guest
 * checkout, Part B phase B1). The order goes to the store through
 * /api/orders; a card is paid on the store's own payment page, opened from the
 * result by the customer's own tap.
 */
export function CheckoutSheet({
  open,
  onOpenChange,
  products,
  locale,
  order,
  onPlaced,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: ShopProduct[]
  locale: Locale
  /** The order placed from this sheet, shown on the result step. */
  order: PlacedOrder | null
  onPlaced: (order: PlacedOrder) => void
}) {
  const { t } = useTranslation()
  const cart = useCart()
  const view = viewCart(cart, products)
  const [step, setStep] = useState<Step>('cart')
  const [form, setForm] = useState<CheckoutForm>(() => emptyCheckoutForm(BRAND.id))
  const [showErrors, setShowErrors] = useState(false)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const sendingRef = useRef(false)

  const invalid = showErrors ? firstInvalidField(form, BRAND.id) : null
  const update = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setProblem(null)
  }

  async function submit() {
    if (sendingRef.current) return
    setShowErrors(true)
    const bad = firstInvalidField(form, BRAND.id)
    if (bad) {
      document.getElementById(`checkout-${bad}`)?.focus()
      return
    }
    sendingRef.current = true
    setSending(true)
    setProblem(null)
    const lines = view.lines.map(({ line }) => line)
    const result = await placeOrder(lines, form, locale)
    sendingRef.current = false
    setSending(false)
    if (result.kind === 'placed') {
      const placed: PlacedOrder = {
        orderNumber: result.orderNumber,
        placedAt: new Date().toISOString(),
        paymentMethod: form.paymentMethod,
        paymentUrl: result.paymentUrl,
        totals: result.totals,
      }
      savePlacedOrder(placed)
      clearCart()
      onPlaced(placed)
      setStep('result')
      return
    }
    if (result.kind === 'unconfirmed') {
      // The order may exist: no retry button, and the cart stays as it was.
      setUnconfirmed(true)
      setStep('result')
      return
    }
    setProblem(result.kind === 'refused' ? { kind: 'refused', message: result.message } : { kind: result.kind })
  }

  const title = step === 'cart' ? t('checkout.cartTitle') : step === 'details' ? t('checkout.detailsTitle') : t('checkout.resultTitle')

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (sending) return
        onOpenChange(next)
        if (!next && step === 'result') {
          setStep('cart')
          setUnconfirmed(false)
        }
      }}
    >
      <SheetContent>
        <SheetHeader className="pr-14">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={step === 'details' ? undefined : 'sr-only'}>
            {step === 'details' ? t('checkout.detailsSubtitle', { store: BRAND.store.name }) : title}
          </SheetDescription>
        </SheetHeader>

        {step === 'cart' && (
          <>
            <SheetBody className="flex flex-col gap-3">
              {view.lines.length === 0 && view.unavailable.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('checkout.empty')}</p>
              )}
              <ul className="flex flex-col divide-y divide-border">
                {view.lines.map(({ line, product }) => (
                  <li key={line.ref} className="flex items-center gap-3 py-3">
                    <Thumb product={product} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{product.name}</span>
                      {product.price && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {t('checkout.each', { price: formatPrice(product.price, locale) })}
                        </span>
                      )}
                    </div>
                    <Stepper
                      value={line.qty}
                      min={0}
                      max={Math.min(MAX_LINE_QTY, product.stock && product.stock > 0 ? product.stock : MAX_LINE_QTY)}
                      onChange={(qty) => setCartQuantity(line.ref, qty)}
                      decrementLabel={t('checkout.fewer', { product: product.name })}
                      incrementLabel={t('checkout.more', { product: product.name })}
                    />
                  </li>
                ))}
                {view.unavailable.map(({ line, product }) => (
                  <li key={line.ref} className="flex items-center gap-3 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-muted-foreground">
                        {product?.name ?? t('checkout.goneProduct')}
                      </span>
                      <span className="text-xs text-muted-foreground">{t('checkout.unavailable')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCartQuantity(line.ref, 0)}
                      aria-label={t('checkout.remove', { product: product?.name ?? t('checkout.goneProduct') })}
                      className="flex size-11 items-center justify-center rounded-xl text-muted-foreground outline-none active:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {view.subtotal && (
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">{t('checkout.estimatedSubtotal')}</span>
                  <span className="font-display text-lg font-bold tabular-nums text-foreground">{formatPrice(view.subtotal, locale)}</span>
                </div>
              )}
              {view.lines.length > 0 && <p className="text-xs leading-relaxed text-muted-foreground">{t('checkout.storePrices', { store: BRAND.store.name })}</p>}
            </SheetBody>
            <Footer>
              <Button fullWidth disabled={view.lines.length === 0} onClick={() => setStep('details')}>
                {t('checkout.continue')}
              </Button>
            </Footer>
          </>
        )}

        {step === 'details' && (
          <>
            <SheetBody className="flex flex-col gap-4">
              <Field id="name" label={t('checkout.name')} error={invalid === 'name' ? t('checkout.errors.name') : undefined}>
                <Input id="checkout-name" autoComplete="name" value={form.name} maxLength={100} onChange={(e) => update('name', e.target.value)} />
              </Field>
              <Field
                id="phone"
                label={t('checkout.phone')}
                hint={BRAND.id === 'pcr' ? t('checkout.phoneHintIntl') : undefined}
                error={invalid === 'phone' ? t(BRAND.id === 'pcr' ? 'checkout.errors.phoneIntl' : 'checkout.errors.phone') : undefined}
              >
                <Input id="checkout-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} maxLength={25} onChange={(e) => update('phone', e.target.value)} />
              </Field>
              <Field id="email" label={t('checkout.email')} hint={t('checkout.emailHint')} error={invalid === 'email' ? t('checkout.errors.email') : undefined}>
                <Input id="checkout-email" type="email" autoComplete="email" inputMode="email" value={form.email} maxLength={254} onChange={(e) => update('email', e.target.value)} />
              </Field>
              <Field id="line1" label={t('checkout.line1')} error={invalid === 'line1' ? t('checkout.errors.required') : undefined}>
                <Input
                  id="checkout-line1"
                  autoComplete="address-line1"
                  placeholder={BRAND.id === 'pcr' ? t('checkout.line1PlaceholderCr') : undefined}
                  value={form.line1}
                  maxLength={200}
                  onChange={(e) => update('line1', e.target.value)}
                />
              </Field>
              <Field id="line2" label={t('checkout.line2')}>
                <Input id="checkout-line2" autoComplete="address-line2" value={form.line2} maxLength={200} onChange={(e) => update('line2', e.target.value)} />
              </Field>
              <Field id="city" label={t('checkout.city')} error={invalid === 'city' ? t('checkout.errors.required') : undefined}>
                <Input id="checkout-city" autoComplete="address-level2" value={form.city} maxLength={100} onChange={(e) => update('city', e.target.value)} />
              </Field>
              {BRAND.id === 'upd' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="region" label={t('checkout.state')} error={invalid === 'region' ? t('checkout.errors.state') : undefined}>
                    <Input
                      id="checkout-region"
                      autoComplete="address-level1"
                      autoCapitalize="characters"
                      value={form.region}
                      maxLength={2}
                      onChange={(e) => update('region', e.target.value.toUpperCase())}
                    />
                  </Field>
                  <Field id="postalCode" label={t('checkout.zip')} error={invalid === 'postalCode' ? t('checkout.errors.zip') : undefined}>
                    <Input
                      id="checkout-postalCode"
                      autoComplete="postal-code"
                      inputMode="numeric"
                      value={form.postalCode}
                      maxLength={10}
                      onChange={(e) => update('postalCode', e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <Field id="region" label={t('checkout.province')}>
                  <Input id="checkout-region" autoComplete="address-level1" value={form.region} maxLength={60} onChange={(e) => update('region', e.target.value)} />
                </Field>
              )}

              {paymentMethodsFor(BRAND.id).length > 1 && (
                <div className="flex flex-col gap-2">
                  <span className="font-display text-sm font-semibold text-foreground">{t('checkout.payWith')}</span>
                  <Segmented
                    ariaLabel={t('checkout.payWith')}
                    value={form.paymentMethod}
                    onChange={(value) => update('paymentMethod', value)}
                    options={paymentMethodsFor(BRAND.id).map((m) => ({ value: m, label: t(`checkout.method.${m}`) }))}
                  />
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {form.paymentMethod === 'card' ? t('checkout.cardNote', { store: BRAND.store.name }) : t('checkout.whatsappNote')}
              </p>

              <label className="flex min-h-11 items-start gap-3 rounded-xl bg-secondary p-3">
                <input
                  id="checkout-researchUseAck"
                  type="checkbox"
                  checked={form.researchUseAck}
                  onChange={(e) => update('researchUseAck', e.target.checked)}
                  aria-invalid={invalid === 'researchUseAck' || undefined}
                  aria-describedby={invalid === 'researchUseAck' ? 'checkout-researchUseAck-error' : undefined}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span className="text-sm leading-snug text-foreground">{t('checkout.researchAck')}</span>
              </label>
              {invalid === 'researchUseAck' && (
                <p id="checkout-researchUseAck-error" className="-mt-2 text-sm text-destructive">
                  {t('checkout.errors.researchAck')}
                </p>
              )}
            </SheetBody>
            <Footer>
              {problem && (
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{problemText(problem, t)}</span>
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" disabled={sending} onClick={() => setStep('cart')}>
                  {t('checkout.back')}
                </Button>
                <Button fullWidth disabled={sending || view.lines.length === 0} onClick={() => void submit()}>
                  {sending && <Loader2 className="animate-spin" />}
                  {sending ? t('checkout.placing') : t('checkout.placeOrder')}
                </Button>
              </div>
            </Footer>
          </>
        )}

        {step === 'result' && (unconfirmed ? <Unconfirmed /> : order ? <OrderResult order={order} locale={locale} /> : null)}
      </SheetContent>
    </Sheet>
  )
}

function problemText(problem: Problem, t: (key: string) => string): string {
  if (problem.kind === 'refused') return problem.message ?? t('checkout.problem.refused')
  return t(`checkout.problem.${problem.kind}`)
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-3 border-t border-border/60 px-5 pb-5 pt-3">{children}</div>
}

function Field({ id, label, hint, error, children }: { id: CheckoutField | 'line2'; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2" aria-invalid={error ? true : undefined}>
      <label htmlFor={`checkout-${id}`} className="font-display text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`checkout-${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function Thumb({ product }: { product: ShopProduct }) {
  const [failed, setFailed] = useState(false)
  const src = product.thumbnailUrl ?? product.imageUrl
  return (
    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
      {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain" />}
    </div>
  )
}

function TotalsList({ totals, locale }: { totals: OrderTotals; locale: Locale }) {
  const { t } = useTranslation()
  const row = (label: string, amount: number, strong = false) => (
    <div className="flex items-baseline justify-between">
      <dt className={strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-display text-lg font-bold text-foreground' : 'text-foreground'}`}>
        {formatPrice({ currency: totals.currency, amount }, locale)}
      </dd>
    </div>
  )
  return (
    <dl className="flex flex-col gap-1 rounded-xl bg-secondary p-3 text-sm">
      {totals.goods !== undefined && row(t('checkout.goods'), totals.goods)}
      {totals.discount ? row(t('checkout.discount'), -totals.discount) : null}
      {totals.shipping !== undefined && row(t('checkout.shipping'), totals.shipping)}
      {row(t('checkout.total'), totals.total, true)}
    </dl>
  )
}

/** The placed order: pay (card), or wait for the store's WhatsApp message. */
export function OrderResult({ order, locale }: { order: PlacedOrder; locale: Locale }) {
  const { t } = useTranslation()
  const paid = useOrderPaid(order)
  const card = order.paymentMethod === 'card'
  return (
    <>
      <SheetBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-positive" />
          <div className="flex flex-col gap-1">
            <p className="font-display text-lg font-semibold text-foreground">{t('checkout.placed', { number: order.orderNumber })}</p>
            <p className="text-sm text-muted-foreground">{t('checkout.keepNumber')}</p>
          </div>
        </div>
        {order.totals && <TotalsList totals={order.totals} locale={locale} />}
        <p aria-live="polite" className="text-sm leading-relaxed text-foreground">
          {!card
            ? t('checkout.whatsappNext')
            : paid
              ? t('checkout.paid', { store: BRAND.store.name })
              : order.paymentUrl
                ? t('checkout.payNext')
                : t('checkout.noPaymentLink', { store: BRAND.store.name })}
        </p>
        {card && order.paymentUrl && !paid && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('checkout.waitingForPayment')}
          </p>
        )}
      </SheetBody>
      {card && order.paymentUrl && !paid && (
        <Footer>
          <a href={order.paymentUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ fullWidth: true })}>
            <ExternalLink />
            {t('checkout.payNow')}
          </a>
        </Footer>
      )}
    </>
  )
}

/** The store couldn't be heard from: the order may exist, so no retry, and a way to ask. */
function Unconfirmed() {
  const { t } = useTranslation()
  const whatsapp = BRAND.contact.whatsapp
  return (
    <>
      <SheetBody className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-6 shrink-0 text-brand-warn" />
          <p className="font-display text-lg font-semibold text-foreground">{t('checkout.unconfirmedTitle')}</p>
        </div>
        <p className="text-sm leading-relaxed text-foreground">{t('checkout.unconfirmedBody', { store: BRAND.store.name })}</p>
      </SheetBody>
      {whatsapp && (
        <Footer>
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t('checkout.unconfirmedWhatsapp'))}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'secondary', fullWidth: true })}
          >
            <MessageCircle />
            {t('checkout.askStore')}
          </a>
        </Footer>
      )}
    </>
  )
}
