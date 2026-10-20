"use client"

import { useFormStatus } from "react-dom"

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "quiet",
}: {
  children: string
  pendingLabel?: string
  variant?: "quiet" | "primary"
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={`pressable inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm ${
        variant === "primary"
          ? "pressable-primary bg-primary text-primary-foreground"
          : "pressable-quiet border border-border"
      }`}
      disabled={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
