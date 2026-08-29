import { AlertTriangle, Bell, BellRing, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DueCard } from './DoseCard'
import type { DoseLog, Protocol, Settings } from '../lib/db'
import { computeDueItems, computeShowBackupNudge } from '../lib/homeData'
import { getNotificationCapability, requestNotificationPermission } from '../lib/notifications'

interface NotificationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  protocols: Protocol[]
  doseLogs: DoseLog[]
  settings: Settings | undefined
  now: Date
  onNavigateToSettings: () => void
  onNavigateToProtocols: () => void
}

/**
 * PeptIQ's home card has a bell with an unread badge, opening what's
 * presumably a notification inbox — we don't have their exact screen to
 * copy, so this is a from-scratch, honest equivalent built from data we
 * already derive: everything currently due/missed (the same list Home's
 * Catch-up section shows, fully actionable here too), plus the backup and
 * notification-permission nudges. No fabricated unread count, no fake
 * history — just "here's what actually needs you right now."
 */
export function NotificationPanel({
  open,
  onOpenChange,
  protocols,
  doseLogs,
  settings,
  now,
  onNavigateToSettings,
  onNavigateToProtocols,
}: NotificationPanelProps) {
  const { t } = useTranslation()
  const [requesting, setRequesting] = useState(false)

  const dueItems = computeDueItems(protocols, doseLogs, now)
  const showBackupNudge = computeShowBackupNudge(protocols, doseLogs, settings, now)
  const capability = getNotificationCapability()
  const showEnableNudge = capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default'
  const showIosNudge = capability.requiresInstallOnIOS
  const hasAnything = dueItems.length > 0 || showBackupNudge || showEnableNudge || showIosNudge

  function goToProtocols() {
    onOpenChange(false)
    onNavigateToProtocols()
  }

  function goToSettings() {
    onOpenChange(false)
    onNavigateToSettings()
  }

  async function handleEnableNotifications() {
    setRequesting(true)
    try {
      await requestNotificationPermission()
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            {t('settings.notifications')}
          </DialogTitle>
          <DialogDescription>{t('notifications.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {showEnableNudge && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BellRing className="size-4 text-primary" />
                {t('notifications.enableNudgeTitle')}
              </p>
              <p className="text-sm text-muted-foreground">{t('notifications.enableNudgeBody')}</p>
              <Button size="sm" disabled={requesting} onClick={() => void handleEnableNotifications()} className="self-start">
                {t('settings.notif.enable')}
              </Button>
            </div>
          )}

          {showIosNudge && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BellRing className="size-4 text-primary" />
                {t('notifications.enableNudgeTitle')}
              </p>
              <p className="text-sm text-muted-foreground">{t('settings.notif.needsInstallIOS')}</p>
            </div>
          )}

          {showBackupNudge && (
            <button
              type="button"
              onClick={goToSettings}
              className="flex min-h-11 items-start gap-2 rounded-2xl border border-brand-warn bg-brand-warn-lt px-4 py-3 text-left text-sm text-brand-warn"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {t('home.backupNudge')}
            </button>
          )}

          {dueItems.map((item) => (
            <DueCard
              key={`${item.protocol.id}-${item.occurrence.scheduledAt.toISOString()}`}
              item={item}
              doseLogs={doseLogs}
              now={now}
              onNavigateToProtocols={goToProtocols}
            />
          ))}

          {!hasAnything && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-8 text-primary" />
              <p className="text-sm font-medium text-foreground">{t('notifications.emptyTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('notifications.emptyBody')}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
