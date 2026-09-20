import { Bell, CheckCircle2, FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { getNotificationCapability, requestNotificationPermission } from '../lib/notifications'
import type { Protocol } from '../lib/db'
import { getCompoundById } from '../content/compounds'

interface ProtocolSavedPromptProps {
  protocol: Protocol
  onReconstitute: () => void
  onSkip: () => void
}

/**
 * Shown right after a new protocol is saved. Saving a protocol is only half
 * of getting started — nothing can be dosed until the vial is mixed — so the
 * next step is offered straight away rather than left for the user to find in
 * the Calculator tab. Reminders get the same treatment here: this is the
 * moment someone has just told the app when their doses are, so it's the
 * natural (and user-gesture-backed) place to ask for notification permission.
 */
export function ProtocolSavedPrompt({ protocol, onReconstitute, onSkip }: ProtocolSavedPromptProps) {
  const { t } = useTranslation()
  const [capability, setCapability] = useState(() => getNotificationCapability())
  const compound = getCompoundById(protocol.compoundId)
  const isSolution = compound?.form === 'solution'
  const dose = `${protocol.doseAmount} ${protocol.doseUnit}`

  const canAskForReminders =
    capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default'

  async function handleEnableReminders() {
    await requestNotificationPermission()
    setCapability(getNotificationCapability())
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 pt-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent">
          <CheckCircle2 className="size-7 text-primary" />
        </span>
        <h1 className="font-display text-2xl font-semibold text-foreground">{t('protocols.savedTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(isSolution ? 'protocols.savedBodySolution' : 'protocols.savedBody', { dose })}
        </p>
      </div>

      <Button onClick={onReconstitute} className="w-full">
        <FlaskConical className="size-4" />
        {t('protocols.reconstituteNow')}
      </Button>

      {canAskForReminders && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
            <Bell className="size-4 text-primary" />
          </span>
          <div className="flex flex-1 flex-col gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">{t('protocols.remindersTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('protocols.remindersBody')}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void handleEnableReminders()} className="self-start">
              {t('settings.notif.enable')}
            </Button>
          </div>
        </div>
      )}

      <button type="button" onClick={onSkip} className="min-h-11 self-center text-sm text-muted-foreground">
        {t('protocols.notNow')}
      </button>
    </div>
  )
}
