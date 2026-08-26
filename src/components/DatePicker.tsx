import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { parseISO } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate, toIsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string // yyyy-MM-dd, or '' for none
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

/**
 * A custom-rendered date field, always displayed dd/MM/yyyy regardless of
 * device locale — replaces native <input type="date">, whose displayed
 * format follows the OS/browser locale rather than the app's language (a
 * limitation documented in NOTES.md). The underlying value stays a plain
 * yyyy-MM-dd string, same as before.
 */
export function DatePicker({ value, onChange, disabled, placeholder }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISO(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-left text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          {value && selected ? formatDate(selected) : (placeholder ?? '')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toIsoDate(date))
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
