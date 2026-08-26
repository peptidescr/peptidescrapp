import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/Button'
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

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-brand-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-muted">{title}</h2>
      {children}
    </section>
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
    <SectionCard title={t('settings.language')}>
      <div className="flex gap-2">
        {(['es-CR', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`min-h-11 flex-1 rounded-xl border text-sm font-medium ${
              locale === l
                ? 'border-brand-primary bg-brand-primary-lt text-brand-primary'
                : 'border-brand-border text-brand-muted'
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
    <SectionCard title={t('settings.notifications')}>
      <p className="text-sm text-brand-muted">{t(statusKey)}</p>
      <p className="text-sm text-brand-muted">{t('settings.notif.reliabilityNote')}</p>
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
    <SectionCard title={t('settings.install.title')}>
      {install.isStandalone ? (
        <p className="text-sm text-brand-muted">{t('settings.install.installed')}</p>
      ) : install.canPromptInstall ? (
        <>
          <p className="text-sm text-brand-muted">{t('settings.install.available')}</p>
          <Button onClick={() => void install.promptInstall()}>{t('settings.install.cta')}</Button>
        </>
      ) : install.isIOS ? (
        <p className="text-sm text-brand-muted">{t('settings.install.iosInstructions')}</p>
      ) : (
        <p className="text-sm text-brand-muted">{t('settings.install.genericInstructions')}</p>
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
    <SectionCard title={t('settings.storage.title')}>
      <p className="text-sm text-brand-muted">
        {persisted === true ? t('settings.storage.persisted') : t('settings.storage.notPersisted')}
      </p>
      {usageMb !== null && (
        <p className="text-sm text-brand-muted">{t('settings.storage.usage', { mb: usageMb.toFixed(1) })}</p>
      )}
    </SectionCard>
  )
}

function BackupSection() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<BackupPayload | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleExportJson() {
    const payload = await buildBackupPayload()
    const result = await shareOrDownloadFile(
      backupToJson(payload),
      `peptidescr-backup-${Date.now()}.json`,
      'application/json',
    )
    if (result !== 'cancelled') {
      await markBackedUp()
      setMessage(t('settings.backup.done'))
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
      setMessage(t('settings.backup.importInvalid'))
    } finally {
      e.target.value = ''
    }
  }

  async function confirmImport() {
    if (!pendingImport) return
    try {
      await importBackupPayload(pendingImport)
      setMessage(t('settings.backup.importDone'))
    } catch {
      setMessage(t('settings.backup.importInvalid'))
    } finally {
      setPendingImport(null)
    }
  }

  return (
    <SectionCard title={t('settings.backup.title')}>
      <p className="text-sm text-brand-muted">
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
      {message && <p className="text-sm text-brand-muted">{message}</p>}
      {pendingImport && (
        <div className="flex flex-col gap-2 rounded-xl bg-brand-warn-lt p-3">
          <p className="text-sm text-brand-warn">{t('settings.backup.importConfirm')}</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={confirmImport}>
              {t('settings.backup.importConfirmCta')}
            </Button>
            <Button variant="secondary" onClick={() => setPendingImport(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
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
      <p className="text-sm text-brand-muted">
        {settings?.legalAcceptedAt
          ? t('settings.legal.accepted', {
              version: settings.legalAcceptedVersion ?? LEGAL_VERSION,
              date: formatDateTime(new Date(settings.legalAcceptedAt)),
            })
          : t('settings.legal.notYetAccepted')}
      </p>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="min-h-11 self-start text-sm text-brand-primary">
        {expanded ? t('settings.legal.hide') : t('settings.legal.view')}
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 text-sm text-brand-muted">
          <p className="font-medium text-brand-ink">{legal.disclaimerTitle}</p>
          <p>{legal.disclaimerBody}</p>
          <p className="font-medium text-brand-ink">{legal.termsTitle}</p>
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
      <img src="/brand/logo-full.png" alt="Peptides Costa Rica" className="h-12 w-auto self-start" />
      <p className="text-sm text-brand-muted">Jacó · San José, Costa Rica</p>
      <a href="https://peptidescostarica.net" className="text-sm text-brand-primary" target="_blank" rel="noreferrer">
        peptidescostarica.net
      </a>
      <a
        href="https://wa.me/50684046973"
        target="_blank"
        rel="noreferrer"
        className="min-h-11 rounded-xl bg-[#25D366] px-4 py-2 text-center text-sm font-semibold text-white"
      >
        {t('settings.contact.whatsapp')}
      </a>
      <a href="tel:+50684046973" className="text-sm text-brand-primary">
        CR +506 8404-6973
      </a>
      <a href="tel:+18314715559" className="text-sm text-brand-primary">
        US +1 (831) 471-5559
      </a>
      <a href="mailto:info@peptidescostarica.net" className="text-sm text-brand-primary">
        info@peptidescostarica.net
      </a>
    </SectionCard>
  )
}
