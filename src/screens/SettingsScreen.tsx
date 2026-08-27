import {
  Bell,
  Database,
  Globe,
  type LucideIcon,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Scale,
  Smartphone,
} from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useInstallState } from '../lib/install'
import { getNotificationCapability, requestNotificationPermission } from '../lib/notifications'
import type { Locale } from '../lib/units'
import { updateSettings, useSettings } from '../lib/useSettings'

export function SettingsScreen() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-4">
      <h1 className="text-xl font-semibold">{t('nav.settings')}</h1>
      <LanguageSection />
      <NotificationsSection />
      <InstallSection />
      <StorageSection />
      <BackupSection />
      <LegalSection />
      <ContactSection />
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function LanguageSection() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const locale = (settings?.locale ?? i18n.language) as Locale

  async function setLocale(next: Locale) {
    await updateSettings({ locale: next })
    await i18n.changeLanguage(next)
  }

  return (
    <SectionCard title={t('settings.language')} icon={Globe}>
      <div className="flex gap-2">
        {(['es-CR', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`min-h-11 flex-1 rounded-full border text-sm font-medium transition-colors ${
              locale === l ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {l === 'es-CR' ? t('settings.spanish') : t('settings.english')}
          </button>
        ))}
      </div>
    </SectionCard>
  )
}

function NotificationsSection() {
  const { t } = useTranslation()
  const [capability, setCapability] = useState(() => getNotificationCapability())

  async function handleRequest() {
    await requestNotificationPermission()
    setCapability(getNotificationCapability())
  }

  let statusKey = 'settings.notif.notSupported'
  if (capability.supported) {
    if (capability.requiresInstallOnIOS) statusKey = 'settings.notif.needsInstallIOS'
    else if (capability.permission === 'granted') statusKey = 'settings.notif.granted'
    else if (capability.permission === 'denied') statusKey = 'settings.notif.denied'
    else statusKey = 'settings.notif.notAsked'
  }

  return (
    <SectionCard title={t('settings.notifications')} icon={Bell}>
      <p className="text-sm text-muted-foreground">{t(statusKey)}</p>
      <p className="text-sm text-muted-foreground">{t('settings.notif.reliabilityNote')}</p>
      {capability.supported && !capability.requiresInstallOnIOS && capability.permission === 'default' && (
        <Button onClick={handleRequest}>{t('settings.notif.enable')}</Button>
      )}
    </SectionCard>
  )
}

function InstallSection() {
  const { t } = useTranslation()
  const install = useInstallState()

  return (
    <SectionCard title={t('settings.install.title')} icon={Smartphone}>
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
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usageMb, setUsageMb] = useState<number | null>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined) setUsageMb(estimate.usage / (1024 * 1024))
    })
  }, [])

  return (
    <SectionCard title={t('settings.storage.title')} icon={Database}>
      <p className="text-sm text-muted-foreground">
        {persisted === true ? t('settings.storage.persisted') : t('settings.storage.notPersisted')}
      </p>
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
      const text = await file.text()
      const payload = JSON.parse(text) as BackupPayload
      setPendingImport(payload)
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
    <SectionCard title={t('settings.backup.title')} icon={Save}>
      <p className="text-sm text-muted-foreground">
        {settings?.lastBackupAt
          ? t('settings.backup.lastBackup', { date: formatDateTime(new Date(settings.lastBackupAt)) })
          : t('settings.backup.never')}
      </p>
      <Button onClick={handleExportJson}>{t('settings.backup.shareJson')}</Button>
      <Button variant="secondary" onClick={handleExportCsv}>
        {t('settings.backup.exportCsv')}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
      />
      <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
        {t('settings.backup.import')}
      </Button>

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
    <SectionCard title={t('settings.legal.title')} icon={Scale}>
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
    <SectionCard title={t('settings.contact.title')} icon={Phone}>
      <img src="/brand/logo-full.png" alt="Peptides Costa Rica" className="h-12 w-auto self-start" />
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
