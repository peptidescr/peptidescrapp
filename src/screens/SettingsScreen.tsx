import { Mail, MessageCircle, Phone } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AppHeader } from '../components/AppHeader'
import { HowItWorksList } from '../components/HowItWorksList'
import { LEGAL_PLACEHOLDER, LEGAL_VERSION } from '../content/legal'
import {
  backupToJson,
  buildBackupPayload,
  doseLogsToCsv,
  importBackupPayload,
  markBackedUp,
  shareOrDownloadFile,
  type BackupPayload,
} from '../lib/backup'
import { formatDateTime } from '../lib/dates'
import { db } from '../lib/db'
import { MAX_BACKUP_BYTES, parseBackup } from '../lib/backupValidation'
import { isPushActive, isPushConfigured } from '../lib/push'
import { useInstallState } from '../lib/install'
import {
  canShowNotifications,
  getNotificationCapability,
  requestNotificationPermission,
  sendTestNotification,
} from '../lib/notifications'
import { applyTheme, resolveTheme } from '../lib/theme'
import type { Locale, ThemeMode } from '../lib/units'
import { updateSettings, useSettings } from '../lib/useSettings'

export function SettingsScreen() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 pt-2">
      <AppHeader title={t('nav.settings')} />
      <PreferencesSection />
      <NotificationsSection />
      <InstallSection />
      <StorageSection />
      <BackupSection />
      <HowItWorksSection />
      <LegalSection />
      <ContactSection />
    </div>
  )
}

/**
 * A titled group. The heading sits above the card, in sentence case, instead
 * of inside it in tracked capitals with an icon — the card is the content, the
 * heading just names it.
 */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}

const THEME_MODES = ['light', 'dark', 'system'] as const

/**
 * Language and appearance are both "how do I want the app to look and read",
 * so they share one card as two labelled rows rather than two cards of their
 * own. Each control persists via updateSettings, then applies its side effect.
 * 'system' with no stored preference is the theme default, matching
 * `settings?.theme ?? 'system'` everywhere else this is read.
 */
function PreferencesSection() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const locale = (settings?.locale ?? i18n.language) as Locale
  const theme: ThemeMode = settings?.theme ?? 'system'

  async function setLocale(next: Locale) {
    await updateSettings({ locale: next })
    await i18n.changeLanguage(next)
  }

  async function setTheme(next: ThemeMode) {
    await updateSettings({ theme: next })
    applyTheme(resolveTheme(next))
  }

  return (
    <Card>
      <CardContent className="gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t('settings.language')}</p>
          <Segmented
            ariaLabel={t('settings.language')}
            value={locale}
            onChange={(next) => void setLocale(next)}
            options={[
              { value: 'es-CR', label: t('settings.spanish') },
              { value: 'en', label: t('settings.english') },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{t('settings.appearance.title')}</p>
          <Segmented
            ariaLabel={t('settings.appearance.title')}
            value={theme}
            onChange={(next) => void setTheme(next)}
            options={THEME_MODES.map((mode) => ({ value: mode, label: t(`settings.appearance.${mode}`) }))}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Reopens the exact same content OnboardingScreen's how-it-works step
 * shows — a revisitable reference for anyone who skimmed past it the first
 * time, or just forgets what a screen does months later.
 */
function HowItWorksSection() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <SectionCard title={t('onboarding.howItWorks.title')}>
        <p className="text-sm text-muted-foreground">{t('settings.howItWorks.body')}</p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('settings.howItWorks.cta')}
        </Button>
      </SectionCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('onboarding.howItWorks.title')}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <HowItWorksList />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}

function NotificationsSection() {
  const { t } = useTranslation()
  const [capability, setCapability] = useState(() => getNotificationCapability())

  async function handleRequest() {
    await requestNotificationPermission()
    setCapability(getNotificationCapability())
  }

  // The one way to tell "notifications are broken on this device" from
  // "no dose has come due yet" without waiting for a real reminder.
  async function handleTest() {
    if (await sendTestNotification()) toast.success(t('settings.notif.testSent'))
    else toast.error(t('settings.notif.testFailed'))
  }

  const pushOn = isPushActive()

  let statusKey = 'settings.notif.notSupported'
  if (capability.supported) {
    if (capability.requiresInstallOnIOS) statusKey = 'settings.notif.needsInstallIOS'
    else if (capability.permission === 'granted') statusKey = 'settings.notif.granted'
    else if (capability.permission === 'denied') statusKey = 'settings.notif.denied'
    else statusKey = 'settings.notif.notAsked'
  }

  return (
    <SectionCard title={t('settings.notifications')}>
      <p className="text-sm text-muted-foreground">{t(statusKey)}</p>
      <p className="text-sm text-muted-foreground">
        {t(pushOn ? 'settings.notif.reliabilityNotePush' : 'settings.notif.reliabilityNote')}
      </p>
      {isPushConfigured() && <p className="text-xs text-muted-foreground">{t('settings.notif.pushNote')}</p>}
      {capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default' && (
        <Button onClick={handleRequest}>{t('settings.notif.enable')}</Button>
      )}
      {canShowNotifications() && (
        <Button variant="secondary" onClick={() => void handleTest()}>
          {t('settings.notif.testCta')}
        </Button>
      )}
    </SectionCard>
  )
}

function InstallSection() {
  const { t } = useTranslation()
  const install = useInstallState()

  return (
    <SectionCard title={t('settings.install.title')}>
      {install.isStandalone ? (
        <p className="text-sm text-muted-foreground">{t('settings.install.installed')}</p>
      ) : install.canPromptInstall ? (
        <>
          <p className="text-sm text-muted-foreground">{t('settings.install.available')}</p>
          <Button onClick={() => void install.promptInstall()}>{t('settings.install.cta')}</Button>
        </>
      ) : install.isIOS ? (
        <p className="text-sm text-muted-foreground">{t('settings.install.iosInstructions')}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('settings.install.genericInstructions')}</p>
      )}
    </SectionCard>
  )
}

function StorageSection() {
  const { t } = useTranslation()
  const install = useInstallState()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usageMb, setUsageMb] = useState<number | null>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined) setUsageMb(estimate.usage / (1024 * 1024))
    })
  }, [])

  // Being installed (standalone) is the signal that actually matters here —
  // on iOS in particular, the Storage Persistence API doesn't reflect the
  // real protection mechanism at all: adding to the Home Screen is what
  // exempts a site from Safari's 7-day no-visit eviction, regardless of what
  // persisted() reports (which is frequently false/unsupported there even
  // once installed). navigator.storage.persisted() is kept as a secondary
  // signal for the (rare) case a browser grants persistence without a
  // formal install. See NOTES.md.
  const protectedFromCleanup = install.isStandalone || persisted === true

  return (
    <SectionCard title={t('settings.storage.title')}>
      <p className="text-sm text-muted-foreground">
        {protectedFromCleanup ? t('settings.storage.persisted') : t('settings.storage.notPersisted')}
      </p>
      <p className="text-sm text-muted-foreground">{t('settings.storage.backupCaveat')}</p>
      {usageMb !== null && (
        <p className="text-sm text-muted-foreground">{t('settings.storage.usage', { mb: usageMb.toFixed(1) })}</p>
      )}
    </SectionCard>
  )
}

function BackupSection() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<BackupPayload | null>(null)

  async function handleExportJson() {
    const payload = await buildBackupPayload()
    const result = await shareOrDownloadFile(
      backupToJson(payload),
      `peptidescr-backup-${Date.now()}.json`,
      'application/json',
    )
    if (result !== 'cancelled') {
      await markBackedUp()
      toast.success(t('settings.backup.done'))
    }
  }

  async function handleExportCsv() {
    const doseLogs = await db.doseLogs.toArray()
    await shareOrDownloadFile(doseLogsToCsv(doseLogs), `peptidescr-history-${Date.now()}.csv`, 'text/csv')
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup file too large')
      const text = await file.text()
      // Validated before the confirmation dialog: a bad file is refused up
      // front instead of failing after the user agrees to replace their data.
      setPendingImport(parseBackup(JSON.parse(text)))
    } catch {
      toast.error(t('settings.backup.importInvalid'))
    } finally {
      e.target.value = ''
    }
  }

  async function confirmImport() {
    if (!pendingImport) return
    try {
      await importBackupPayload(pendingImport)
      toast.success(t('settings.backup.importDone'))
    } catch {
      toast.error(t('settings.backup.importInvalid'))
    } finally {
      setPendingImport(null)
    }
  }

  return (
    <SectionCard title={t('settings.backup.title')}>
      <p className="text-sm text-muted-foreground">
        {settings?.lastBackupAt
          ? t('settings.backup.lastBackup', { date: formatDateTime(new Date(settings.lastBackupAt)) })
          : t('settings.backup.never')}
      </p>
      <Button onClick={handleExportJson}>{t('settings.backup.shareJson')}</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={handleExportCsv}>
          {t('settings.backup.exportCsv')}
        </Button>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          {t('settings.backup.import')}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
      />

      <AlertDialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.backup.importConfirmCta')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.backup.importConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={confirmImport}>{t('settings.backup.importConfirmCta')}</AlertDialogAction>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}

function LegalSection() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const locale: keyof typeof LEGAL_PLACEHOLDER = i18n.language === 'en' ? 'en' : 'es-CR'
  const legal = LEGAL_PLACEHOLDER[locale]
  const [expanded, setExpanded] = useState(false)

  return (
    <SectionCard title={t('settings.legal.title')}>
      <p className="text-sm text-muted-foreground">
        {settings?.legalAcceptedAt
          ? t('settings.legal.accepted', {
              version: settings.legalAcceptedVersion ?? LEGAL_VERSION,
              date: formatDateTime(new Date(settings.legalAcceptedAt)),
            })
          : t('settings.legal.notYetAccepted')}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="min-h-11 self-start text-sm text-primary"
      >
        {expanded ? t('settings.legal.hide') : t('settings.legal.view')}
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{legal.disclaimerTitle}</p>
          <p>{legal.disclaimerBody}</p>
          <p className="font-medium text-foreground">{legal.termsTitle}</p>
          <p>{legal.termsBody}</p>
        </div>
      )}
    </SectionCard>
  )
}

function ContactSection() {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('settings.contact.title')}>
      <img src="/brand/logo-full.png" alt="Peptides Costa Rica" className="h-16 w-auto self-start rounded-xl" />
      <p className="text-sm text-muted-foreground">Jacó · San José, Costa Rica</p>
      <a href="https://peptidescostarica.net" className="text-sm text-primary" target="_blank" rel="noreferrer">
        peptidescostarica.net
      </a>
      <Button asChild className="justify-start bg-[#25D366] text-white active:bg-[#1da851]">
        <a href="https://wa.me/50684046973" target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" />
          {t('settings.contact.whatsapp')}
        </a>
      </Button>
      <a href="tel:+50684046973" className="flex items-center gap-2 text-sm text-primary">
        <Phone className="size-4" />
        CR +506 8404-6973
      </a>
      <a href="tel:+18314715559" className="flex items-center gap-2 text-sm text-primary">
        <Phone className="size-4" />
        US +1 (831) 471-5559
      </a>
      <a href="mailto:info@peptidescostarica.net" className="flex items-center gap-2 text-sm text-primary">
        <Mail className="size-4" />
        info@peptidescostarica.net
      </a>
    </SectionCard>
  )
}
