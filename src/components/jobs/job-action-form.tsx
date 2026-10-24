"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { initialJobActionState, type JobActionState } from "@/lib/jobs/action-state"

export function JobActionForm({
  action,
  fields,
  label,
  variant = "outline",
}: {
  action: (previous: JobActionState, formData: FormData) => Promise<JobActionState>
  fields: Record<string, string>
  label: string
  variant?: "outline" | "default" | "secondary" | "ghost"
}) {
  const [state, formAction, pending] = useActionState(action, initialJobActionState)
  return (
    <form action={formAction}>
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      {state.message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
