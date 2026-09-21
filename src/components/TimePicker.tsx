import { ClockIcon } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatClock, from12Hour, to12Hour, type Period } from '@/lib/dates'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const PERIODS: Period[] = ['AM', 'PM']

interface TimePickerProps {
  value: string // stored form: "HH:mm", 24h
  onChange: (value: string) => void
}

/**
 * A custom-rendered time field shown as a 12-hour clock with AM/PM — replaces
 * native <input type="time">, whose displayed format (12h vs 24h) follows the
 * OS/browser locale rather than the app's own choice (same limitation as
 * DatePicker, documented in NOTES.md). Hour, minute and AM/PM are plain lists,
 * so nothing invalid can be entered. The value in and out is still the stored
 * 24h "HH:mm" string; only what's displayed is 12-hour.
 */
export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const { hour, minute, period } = to12Hour(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-full border border-input bg-card px-4 text-left text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
          {formatClock(value)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto gap-2 p-2">
        <Select value={String(hour)} onValueChange={(h) => onChange(from12Hour(Number(h), minute, period))}>
          <SelectTrigger className="w-20" aria-label="Hour">
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
        <Select value={minute} onValueChange={(m) => onChange(from12Hour(hour, m, period))}>
          <SelectTrigger className="w-20" aria-label="Minute">
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
        <Select value={period} onValueChange={(p) => onChange(from12Hour(hour, minute, p as Period))}>
          <SelectTrigger className="w-24" aria-label="AM/PM">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  )
}
