"use client"

import { useActionState } from "react"

import { AuthFrame, Field, FormStatus } from "@/components/auth/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuthFormState } from "@/lib/auth/form-state"
import { initialAuthFormState } from "@/lib/auth/form-state"
import { fieldErrorsFrom, resetPasswordSchema } from "@/lib/auth/schemas"

export function ResetPasswordForm({
  updatePassword,
}: {
  updatePassword: (formData: FormData) => Promise<AuthFormState>
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: AuthFormState, formData: FormData) => {
      const parsed = resetPasswordSchema.safeParse({
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
    <AuthFrame
      title="Choose a new password"
      description="Use at least 8 characters, including a letter and a number."
    >
      <form action={formAction} className="space-y-4" noValidate>
        <FormStatus state={state} />
        <Field name="password" label="New password" error={state.fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state.fieldErrors.password)}
            aria-describedby={
              state.fieldErrors.password ? "password-error" : undefined
            }
          />
        </Field>
        <Field
          name="confirmPassword"
          label="Confirm password"
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
              state.fieldErrors.confirmPassword
                ? "confirmPassword-error"
                : undefined
            }
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthFrame>
  )
}
