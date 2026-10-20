"use client"

import { Pencil } from "lucide-react"
import { useState, type ReactNode } from "react"

export function EntryEditor({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="shrink-0">
      <button
        type="button"
        className="pressable pressable-quiet inline-flex size-8 items-center justify-center rounded-lg border"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}
