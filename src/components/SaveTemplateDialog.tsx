import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getCompoundById } from '../content/compounds'
import type { Protocol } from '../lib/db'
import { MAX_NAME_LENGTH, sanitizeText } from '../lib/sanitize'
import { saveProtocolAsTemplate } from '../lib/userTemplates'

/** Names and saves a protocol as one of the user's own templates. Mounted only while open. */
export function SaveTemplateDialog({ protocol, onClose }: { protocol: Protocol; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(protocol.name || getCompoundById(protocol.compoundId)?.name || '')
  const [busy, setBusy] = useState(false)
  const valid = sanitizeText(name, MAX_NAME_LENGTH).trim().length > 0

  async function handleSave() {
    setBusy(true)
    try {
      await saveProtocolAsTemplate(protocol, name)
      toast.success(t('templates.saved'))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('templates.saveTitle')}</DialogTitle>
          <DialogDescription>{t('templates.saveBody')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !busy) void handleSave()
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t('templates.nameLabel')}</span>
            <Input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(sanitizeText(e.target.value))} autoFocus />
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={!valid || busy}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
