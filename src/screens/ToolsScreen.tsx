import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '@/components/ui/segmented'
import type { ToolId } from '../lib/pages'

/**
 * The tools Tools can hold. There is one — the reconstitution calculator — so
 * it is shown directly, as the approved design has it. Adding a second tool is
 * adding an entry here (and its ToolId in src/lib/pages.ts); the screen then
 * shows a switcher above whichever tool is open.
 */
const TOOLS: { id: ToolId; labelKey: string }[] = [{ id: 'calculator', labelKey: 'calculator.title' }]

export function ToolsScreen({
  tool,
  onSelectTool,
  children,
}: {
  tool: ToolId
  onSelectTool: (tool: ToolId) => void
  /** The open tool's own screen. */
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      {TOOLS.length > 1 && (
        <div className="px-4 pt-2">
          <Segmented
            ariaLabel={t('tools.title')}
            value={tool}
            onChange={onSelectTool}
            options={TOOLS.map((entry) => ({ value: entry.id, label: t(entry.labelKey) }))}
          />
        </div>
      )}
      {children}
    </div>
  )
}
