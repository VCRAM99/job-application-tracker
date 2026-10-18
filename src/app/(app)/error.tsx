"use client"

import { Button } from "@/components/ui/button"

export default function ProtectedError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-lg space-y-4" role="alert">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        This page could not be loaded. Your session is unchanged.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
