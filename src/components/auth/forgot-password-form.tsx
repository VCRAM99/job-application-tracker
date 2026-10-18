"use client"

import Link from "next/link"
import { useActionState } from "react"

import { AuthFrame, Field, FormStatus } from "@/components/auth/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuthFormState } from "@/lib/auth/form-state"
import { initialAuthFormState } from "@/lib/auth/form-state"
import { fieldErrorsFrom, forgotPasswordSchema } from "@/lib/auth/schemas"

export function ForgotPasswordForm({
  requestReset,
}: {
  requestReset: (formData: FormData) => Promise<AuthFormState>
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: AuthFormState, formData: FormData) => {
      const parsed = forgotPasswordSchema.safeParse({
        email: formData.get("email"),
      })

      if (!parsed.success) {
        return {
          status: "error" as const,
          message: "Check the form and try again.",
          fieldErrors: fieldErrorsFrom(parsed.error),
        }
      }

      return requestReset(formData)
    },
    initialAuthFormState,
  )

  return (
    <AuthFrame
      title="Reset your password"
      description="We will email a reset link if an account exists for this address."
    >
      <form action={formAction} className="space-y-4" noValidate>
        <FormStatus state={state} />
        <Field name="email" label="Email" error={state.fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.fieldErrors.email)}
            aria-describedby={state.fieldErrors.email ? "email-error" : undefined}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link href="/login" className="text-sm underline underline-offset-4">
        Back to sign in
      </Link>
    </AuthFrame>
  )
}
