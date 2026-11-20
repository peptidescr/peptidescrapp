import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TURNSTILE_SITE_KEY } from '../../lib/store/accountForms'

/**
 * Cloudflare Turnstile, the bot check UPD asks for on sign-up and password
 * reset. Rendered explicitly (Cloudflare's documented SPA way): the script is
 * loaded the first time a form needs it, the widget is rendered with UPD's site
 * key and the form's action, and each solved check hands its token up. A token
 * works once, so the form bumps `resetKey` after every try to get a new one.
 *
 * The site key only works on the web addresses UPD lists for it (Cloudflare's
 * hostname management); elsewhere the widget fails and says so.
 */

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')))
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('turnstile failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export function TurnstileWidget({ action, onToken, resetKey }: { action: 'signup' | 'recover'; onToken: (token: string | null) => void; resetKey: number }) {
  const { t, i18n } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const tokenHandler = useRef(onToken)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    tokenHandler.current = onToken
  }, [onToken])

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return
        widget.current = api.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
          language: i18n.language,
          // The full widget needs 300px; the narrowest phones get Cloudflare's compact one instead.
          size: container.current.clientWidth < 300 ? 'compact' : 'flexible',
          callback: (token: string) => {
            setFailed(false)
            tokenHandler.current(token)
          },
          'expired-callback': () => tokenHandler.current(null),
          'error-callback': () => {
            setFailed(true)
            tokenHandler.current(null)
          },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [action, i18n.language])

  // A new try needs a new token.
  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      tokenHandler.current(null)
      window.turnstile.reset(widget.current)
    }
  }, [resetKey])

  return (
    <div className="flex flex-col gap-1">
      <div ref={container} className="min-h-[65px]" />
      {failed && <p className="text-xs text-destructive">{t('signIn.checkFailed')}</p>}
    </div>
  )
}
