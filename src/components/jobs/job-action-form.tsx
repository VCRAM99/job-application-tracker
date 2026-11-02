"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
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
