import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '@/lib/utils'

/** react-day-picker v10 wrapper, styled to match the app's design tokens. */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-2', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'flex flex-col gap-3',
        nav: 'flex items-center justify-between absolute inset-x-2 top-2',
        button_previous: cn(
          'inline-flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-accent disabled:opacity-30',
        ),
        button_next: cn(
          'inline-flex size-8 items-center justify-center rounded-lg text-foreground hover:bg-accent disabled:opacity-30',
        ),
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-semibold text-foreground',
        month_grid: 'w-full border-collapse mt-2',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-9 text-xs font-medium text-center',
        week: 'flex w-full mt-1',
        day: 'relative w-9 h-9 p-0 text-center text-sm',
        day_button: cn(
          'inline-flex size-9 items-center justify-center rounded-lg text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        ),
        today: '[&_button]:border [&_button]:border-primary',
        selected: '[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:hover:bg-primary',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-30',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  )
}
