import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { es, enUS } from 'react-day-picker/locale'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Calendar } from '@/components/ui/calendar'
import { PopoverContent } from '@/components/ui/popover'
import { formatDate, parseTypedDate, toIsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string // yyyy-MM-dd, or '' for none
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

/**
 * A date field, always displayed dd/MM/yyyy regardless of device locale —
 * replaces native <input type="date">, whose displayed format follows the
 * OS/browser locale rather than the app's language (a limitation documented
 * in NOTES.md). You can type the date, or tap the calendar icon and pick it;
 * the underlying value stays a plain yyyy-MM-dd string either way.
 */
export function DatePicker({ value, onChange, disabled, placeholder }: DatePickerProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  /** What the user has typed; null means "not editing — show the formatted value". */
  const [text, setText] = useState<string | null>(null)
  const selected = value ? parseISO(value) : undefined
  const display = text ?? (selected ? formatDate(selected) : '')

  /** Commit a typed date if it's real; otherwise fall back to the previous value. */
  function commitText() {
    if (text !== null) {
      const parsed = parseTypedDate(text)
      if (parsed) onChange(toIsoDate(parsed))
      setText(null)
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div className="relative w-full">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            value={display}
            placeholder={placeholder ?? 'dd/mm/aaaa'}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitText()
              }
            }}
            className={cn(
              'min-h-11 w-full rounded-full border border-input bg-card pl-4 pr-11 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
            )}
          />
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Calendar"
              className="absolute inset-y-0 right-1 flex w-10 items-center justify-center text-muted-foreground outline-none focus-visible:text-foreground disabled:opacity-40"
            >
              <CalendarIcon className="size-4" />
            </button>
          </PopoverPrimitive.Trigger>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          selected={selected}
          locale={i18n.language === 'en' ? enUS : es}
          onSelect={(date) => {
            if (date) {
              setText(null)
              onChange(toIsoDate(date))
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </PopoverPrimitive.Root>
  )
}
