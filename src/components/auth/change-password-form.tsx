"use client"

import { useActionState } from "react"

import { Field, FormStatus } from "@/components/auth/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuthFormState } from "@/lib/auth/form-state"
import { initialAuthFormState } from "@/lib/auth/form-state"
import { changePasswordSchema, fieldErrorsFrom } from "@/lib/auth/schemas"

export function ChangePasswordForm({
  updatePassword,
}: {
  updatePassword: (formData: FormData) => Promise<AuthFormState>
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: AuthFormState, formData: FormData) => {
      const parsed = changePasswordSchema.safeParse({
        currentPassword: formData.get("currentPassword"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
      })

      if (!parsed.success) {
        return {
          status: "error" as const,
          message: "Check the form and try again.",
          fieldErrors: fieldErrorsFrom(parsed.error),
        }
      }

      return updatePassword(formData)
    },
    initialAuthFormState,
  )

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormStatus state={state} />
      <Field
        name="currentPassword"
        label="Current password"
        error={state.fieldErrors.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors.currentPassword)}
          aria-describedby={
            state.fieldErrors.currentPassword ? "currentPassword-error" : undefined
          }
        />
      </Field>
      <Field name="password" label="New password" error={state.fieldErrors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors.password)}
          aria-describedby={state.fieldErrors.password ? "password-error" : undefined}
        />
      </Field>
      <Field
        name="confirmPassword"
        label="Confirm new password"
        error={state.fieldErrors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors.confirmPassword)}
          aria-describedby={
            state.fieldErrors.confirmPassword ? "confirmPassword-error" : undefined
          }
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  )
}
