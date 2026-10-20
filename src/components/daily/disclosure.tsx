"use client"

import { ChevronRight } from "lucide-react"
import { useId, useState, type ReactNode } from "react"

export function Disclosure({
  title,
  badge,
  summary,
  defaultOpen = false,
  persistKey,
  plain = false,
  children,
}: {
  title: string
  badge?: ReactNode
  summary?: string
  defaultOpen?: boolean
  persistKey?: string
  plain?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  function toggle() {
    const next = !open
    setOpen(next)
    if (persistKey) {
      document.cookie = `${persistKey}=${next ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
  }

  return (
    <section className={plain ? "rounded-xl border" : "surface"}>
      <h2>
        <button
          type="button"
          className="pressable pressable-quiet flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <ChevronRight className={`disclosure-chevron size-4 shrink-0 text-muted-foreground ${open ? "rotate-90" : ""}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
              {badge}
            </span>
            {summary ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span> : null}
          </span>
        </button>
      </h2>
      <div id={panelId} className="disclosure-panel" data-open={open ? "true" : "false"} inert={open ? undefined : true}>
        <div className="disclosure-inner">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
