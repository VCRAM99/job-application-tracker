"use client"

import { Check } from "lucide-react"

import type { ChecklistItem } from "@/lib/daily/model"

/** Large tap targets; the check updates on click and the server confirms behind it. */
export function Checklist({ items, onToggle }: { items: ChecklistItem[]; onToggle: (item: ChecklistItem) => void }) {
  if (items.length === 0) {
    return <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">Nothing is scheduled for this day.</p>
  }
  const done = items.filter((item) => item.completed).length
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {done} of {items.length} done
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.completed}
              aria-label={item.title}
              aria-describedby={item.description ? `task-description-${item.id}` : undefined}
              onClick={() => onToggle(item)}
              className={`pressable group flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                item.completed ? "bg-[color-mix(in_oklch,var(--tone-good)_10%,transparent)]" : "bg-muted/40 hover:bg-muted/70"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  item.completed ? "border-[var(--tone-good)] bg-[var(--tone-good)] text-background" : "border-muted-foreground"
                }`}
              >
                {item.completed ? <Check key="done" className="daily-check-mark size-3.5" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium transition-colors ${item.completed ? "text-muted-foreground line-through decoration-1" : ""}`}>{item.title}</span>
                {item.description ? <span id={`task-description-${item.id}`} className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
