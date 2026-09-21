import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  /** Muted secondary text shown after the label (e.g. a compound's category). */
  hint?: string
}

interface ComboboxProps {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  /** Shown when the typed text matches nothing. */
  emptyText?: string
  /** Accept text that isn't one of the options: a free-text field with suggestions, like a name. */
  allowCustom?: boolean
  /** Caps how much can be typed into the field. */
  maxLength?: number
  className?: string
  'aria-label'?: string
}

/** Case- and accent-insensitive, so "sueno" finds "Sueño" and "bpc" finds "BPC-157". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * A dropdown you can also type into: focusing it selects the current text so
 * typing replaces it, and the list narrows as you type. Options keep the order
 * they're passed in — callers own sorting (the app's rule is alphabetical), and
 * filtering never reorders, so a filtered list is still alphabetical.
 *
 * Built on Radix Popover with the input as an anchor rather than a trigger,
 * because a popover trigger toggles on click and steals focus, neither of which
 * is what a text field should do. Options use `onMouseDown` preventDefault so
 * tapping one doesn't blur the input first (which would commit/revert the text
 * before the tap registered).
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  emptyText,
  allowCustom = false,
  maxLength,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  /** What the user has typed; null means "not editing — show the selected label". */
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)

  const selected = options.find((o) => o.value === value)
  const displayText = query ?? selected?.label ?? value

  const filtered = useMemo(() => {
    const needle = query === null ? '' : normalize(query)
    if (!needle) return options
    return options.filter((o) => normalize(`${o.label} ${o.hint ?? ''}`).includes(needle))
  }, [options, query])

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function close() {
    setOpen(false)
    setQuery(null)
  }

  function choose(option: ComboboxOption) {
    onValueChange(option.value)
    close()
  }

  /** Commit whatever's typed when the user leaves the field, or revert it. */
  function commitTypedText() {
    const text = query?.trim()
    if (text) {
      const exact = options.find((o) => normalize(o.label) === normalize(text))
      if (exact) {
        onValueChange(exact.value)
      } else if (allowCustom) {
        onValueChange(text)
      }
    }
    close()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) setOpen(true)
        else setHighlight((h) => Math.min(h + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
        break
      case 'Enter': {
        // Never let Enter submit a surrounding form while the list is open.
        e.preventDefault()
        const option = open ? filtered[highlight] : undefined
        if (option && (!allowCustom || query === null || normalize(option.label).startsWith(normalize(query)))) {
          choose(option)
        } else {
          commitTypedText()
        }
        break
      }
      case 'Escape':
        if (open) {
          e.stopPropagation()
          close()
        }
        break
      case 'Tab':
        commitTypedText()
        break
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverPrimitive.Anchor asChild>
        <div ref={anchorRef} className={cn('relative w-full', className)}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={ariaLabel}
            autoComplete="off"
            maxLength={maxLength}
            autoCapitalize="off"
            spellCheck={false}
            value={displayText}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
              setOpen(true)
            }}
            onFocus={(e) => {
              e.target.select()
              setOpen(true)
            }}
            onBlur={commitTypedText}
            onKeyDown={handleKeyDown}
            className="min-h-11 w-full rounded-full border border-input bg-card pl-4 pr-10 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onMouseDown={(e) => {
              e.preventDefault()
              if (open) close()
              else {
                inputRef.current?.focus()
                setOpen(true)
              }
            }}
            className="absolute inset-y-0 right-1 flex w-9 items-center justify-center text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Clicks/focus inside the field itself are the field's own business,
          // not an "outside" interaction that should dismiss the list.
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
        >
          <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((option, index) => (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  data-index={index}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    'relative flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-3 pr-8 text-base',
                    index === highlight && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {option.hint && <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
                  {option.value === value && <Check className="absolute right-2 size-4" />}
                </div>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
