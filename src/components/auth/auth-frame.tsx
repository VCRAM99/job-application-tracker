import type { ReactNode } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import type { AuthFormState } from "@/lib/auth/form-state"
import type { AuthField } from "@/lib/auth/schemas"

export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function FormStatus({ state }: { state: AuthFormState }) {
  if (!state.message) return null

  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  )
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  )
}

export function Field({
  name,
  label,
  error,
  children,
}: {
  name: AuthField
  label: string
  error?: string
  children: ReactNode
}) {
  const errorId = `${name}-error`

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
