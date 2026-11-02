"use client"

import { useActionState, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { MoreActions, MoreActionsButton } from "@/components/ui/more-actions"
import { initialJobActionState, type JobActionState } from "@/lib/jobs/action-state"

/**
 * `optimisticLabel` is the label after the action succeeds, such as "Unsave"
 * for "Save". It shows while the request runs; if the server rejects it, the
 * original label returns with the error message.
 */
export function JobActionForm({
  action,
  fields,
  label,
  optimisticLabel,
  variant = "outline",
}: {
  action: (previous: JobActionState, formData: FormData) => Promise<JobActionState>
  fields: Record<string, string>
  label: string
  optimisticLabel?: string
  variant?: "outline" | "default" | "secondary" | "ghost"
}) {
  const [state, formAction, pending] = useActionState(action, initialJobActionState)
  return (
    <form action={formAction}>
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Button type="submit" variant={variant} size="sm" disabled={pending} aria-busy={pending || undefined}>
        {pending ? (optimisticLabel ?? "Saving…") : label}
      </Button>
      {state.message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}

type JobAction = (previous: JobActionState, formData: FormData) => Promise<JobActionState>

/**
 * Less frequent job actions in a ⋯ menu. Each item calls the same server action as its old
 * button; the result message shows next to the menu, so it stays visible after the menu closes.
 */
export function JobMoreActions({ items }: { items: Array<{ label: string; action: JobAction; fields: Record<string, string> }> }) {
  const [state, setState] = useState<JobActionState>(initialJobActionState)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MoreActions label="More job actions" align="start">
        {items.map((item) => (
          <MoreActionsButton
            key={item.label}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const form = new FormData()
                for (const [key, value] of Object.entries(item.fields)) form.set(key, value)
                setState(await item.action(initialJobActionState, form))
              })
            }
          >
            {item.label}
          </MoreActionsButton>
        ))}
      </MoreActions>
      {pending ? <span className="text-xs text-muted-foreground">Saving…</span> : null}
      {!pending && state.message ? (
        <span className="text-xs text-muted-foreground" role="status">
          {state.message}
        </span>
      ) : null}
    </div>
  )
}
