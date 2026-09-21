import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { sanitizeDecimal, sanitizeInteger } from '@/lib/sanitize'

interface NumericInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /** 'decimal' allows one '.' or ','; 'integer' allows digits only. */
  kind: 'decimal' | 'integer'
  value: string
  onValueChange: (value: string) => void
  maxLength?: number
}

/**
 * A text field that can only ever contain a number. Anything else — letters,
 * signs, "e", emoji, a second decimal point — is removed as it's typed or
 * pasted, so the value never has to be defended against downstream.
 *
 * Deliberately `type="text"` with `inputMode`, not `type="number"`: number
 * inputs accept "e", "+" and "-", report an empty string for partly-typed
 * values like "1.", ignore the decimal comma some locales use, and their
 * spinner/scroll-wheel behaviour changes values by accident. `inputMode`
 * still brings up the numeric keypad on phones.
 */
export function NumericInput({ kind, value, onValueChange, maxLength, ...props }: NumericInputProps) {
  const clean = kind === 'decimal' ? sanitizeDecimal : sanitizeInteger
  return (
    <Input
      {...props}
      type="text"
      inputMode={kind === 'decimal' ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={value}
      onChange={(e) => onValueChange(maxLength === undefined ? clean(e.target.value) : clean(e.target.value, maxLength))}
    />
  )
}
