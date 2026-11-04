import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NoticeRow } from '@/components/ui/notice-row'

/** "It's been a while since your last backup", on Home and in the bell's panel: one notice shape, opens Settings. */
export function BackupNudge({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  return <NoticeRow icon={Download} tone="warn" title={t('home.backupNudge')} onClick={onOpen} />
}
