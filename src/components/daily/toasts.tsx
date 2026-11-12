"use client"

import { X } from "lucide-react"

import type { Toast } from "@/components/daily/store"

/** Small, polite notices at the bottom of the page: failed saves (already rolled back) and undo offers. */
export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {toasts.map((toast) => (
        <div key={toast.id} className="daily-fade-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              className="pressable pressable-quiet rounded-md px-2 py-1 text-sm font-medium"
              onClick={() => {
                toast.action?.run()
                dismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button type="button" className="pressable pressable-quiet rounded-md p-1 text-muted-foreground" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
