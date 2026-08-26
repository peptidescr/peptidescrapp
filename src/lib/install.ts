import { useEffect, useReducer } from 'react'
import { isAndroid, isIOS, isStandalone } from './platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

if (typeof window !== 'undefined') {
  // Chromium fires this instead of showing its own install UI, letting the
  // app show its own install step (used in onboarding + Settings).
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  await deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  deferredPrompt = null
  return choice.outcome
}

export interface InstallState {
  /** True only on Chromium browsers that fired beforeinstallprompt — the only platform with a programmatic install trigger. */
  canPromptInstall: boolean
  isStandalone: boolean
  isIOS: boolean
  isAndroid: boolean
  promptInstall: typeof promptInstall
}

/** Live install-availability state — re-renders when Chromium's install prompt becomes available or the app gets installed. */
export function useInstallState(): InstallState {
  const [, forceRender] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    listeners.add(forceRender)
    return () => {
      listeners.delete(forceRender)
    }
  }, [])

  return {
    canPromptInstall: deferredPrompt !== null,
    isStandalone: isStandalone(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    promptInstall,
  }
}
