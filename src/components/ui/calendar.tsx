import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '@/lib/utils'

/**
 * react-day-picker v10 wrapper, styled to match the app's design tokens.
 *
 * Every day is at least 44px tall. Its width is a seventh of the calendar, which
 * is 44px at the full 19.75rem and a little less when the card around it is
 * narrower (about 38px on a 320px phone): seven columns can't all be 44px wide
 * there.
 */
export function Calendar({ className, classNames, components, showOutsideDays = true, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('relative w-[19.75rem] max-w-full p-1', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'flex flex-col gap-3',
        nav: 'flex items-center justify-between absolute inset-x-1 top-1',
        button_previous: cn(
          'inline-flex size-11 items-center justify-center rounded-xl text-foreground hover:bg-accent disabled:opacity-30',
        ),
        button_next: cn(
          'inline-flex size-11 items-center justify-center rounded-xl text-foreground hover:bg-accent disabled:opacity-30',
        ),
        month_caption: 'flex h-11 items-center justify-center',
        caption_label: 'font-display text-sm font-bold text-foreground',
        month_grid: 'w-full border-collapse mt-2',
        weekdays: 'flex',
        weekday: 'text-muted-foreground flex-1 text-xs font-medium text-center',
        week: 'flex w-full mt-1',
        day: 'relative h-11 min-w-0 flex-1 p-0 text-center text-sm',
        day_button: cn(
          'inline-flex h-11 w-full items-center justify-center rounded-xl text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        ),
        // Today is the soft tint with a bold brand-coloured number; the selected
        // day is the solid brand fill (also when it is today).
        today: '[&_button]:bg-secondary [&_button]:font-bold [&_button]:text-primary',
        // `!`: a selected day that is also today must not end up primary-on-primary.
        selected: '[&_button]:bg-primary! [&_button]:font-bold [&_button]:text-primary-foreground! [&_button]:hover:bg-primary',
        // Muted ink, not faded: a dimmed day dropped under 4.5:1.
        outside: 'text-muted-foreground',
        disabled: 'text-muted-foreground opacity-30',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
        // Merged, not replaced, so a caller's custom DayButton keeps these chevrons.
        ...components,
      }}
      {...props}
    />
  )
}
