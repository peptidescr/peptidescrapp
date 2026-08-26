import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-primary text-white active:bg-brand-primary-dk disabled:opacity-40',
  secondary:
    'bg-brand-surface text-brand-ink border border-brand-border active:bg-brand-surface-2 disabled:opacity-40',
  ghost: 'bg-transparent text-brand-primary active:bg-brand-primary-lt disabled:opacity-40',
  danger: 'bg-transparent text-brand-warn border border-brand-warn active:bg-brand-primary-lt',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/** Every touch target here is >=44px tall, per the brief's one-handed-use requirement. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`min-h-11 rounded-xl px-4 text-base font-medium transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  )
}
