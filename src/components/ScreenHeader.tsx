import type { ReactNode } from 'react'

/** Small consistent brand touch at the top of every non-Home screen — Home gets the full hero treatment instead. */
export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <img src="/brand/icon-192.png" alt="" className="size-6 rounded-lg" />
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      </div>
      {action}
    </div>
  )
}
