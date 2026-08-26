import type { HTMLAttributes } from 'react'

/**
 * The one card surface style, used everywhere a screen groups content into a
 * block (Home's due/next-up cards, Calculator's result panel, Settings'
 * sections, etc.) — one place to adjust if the look needs to change.
 */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-brand-border bg-brand-surface p-4 shadow-sm ${className}`}
      {...props}
    />
  )
}
