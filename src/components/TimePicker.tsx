import { ClockIcon } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface TimePickerProps {
  value: string // "HH:mm", 24h
  onChange: (value: string) => void
}

/**
 * A custom-rendered time field, always 24h regardless of device locale —
 * replaces native <input type="time">, whose displayed format (12h AM/PM vs
 * 24h) follows the OS/browser locale rather than the app's language (same
 * limitation as DatePicker, documented in NOTES.md). Stored value stays the
 * same "HH:mm" string.
 */
export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const [hour, minute] = value.split(':')

  function setHour(h: string) {
    onChange(`${h}:${minute ?? '00'}`)
  }
  function setMinute(m: string) {
    onChange(`${hour ?? '00'}:${m}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-left text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-2 p-2">
        <Select value={hour} onValueChange={setHour}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex items-center text-lg text-muted-foreground">:</span>
        <Select value={minute} onValueChange={setMinute}>
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  )
}
