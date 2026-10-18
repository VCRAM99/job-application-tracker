"use client"

import Link from "next/link"
import { useActionState } from "react"

import { AuthFrame, Field, FormStatus } from "@/components/auth/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuthFormState } from "@/lib/auth/form-state"
import { initialAuthFormState } from "@/lib/auth/form-state"
import { fieldErrorsFrom, signupSchema } from "@/lib/auth/schemas"

export function SignupForm({
  authenticate,
}: {
  authenticate: (formData: FormData) => Promise<AuthFormState>
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: AuthFormState, formData: FormData) => {
      const parsed = signupSchema.safeParse({
        email: formData.get("email"),
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

      return authenticate(formData)
    },
    initialAuthFormState,
  )

  if (state.status === "success") {
    return (
      <AuthFrame
        title="Check your email"
        description="Email verification is required before you can sign in."
      >
        <FormStatus state={state} />
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      title="Create an account"
      description="Use a password with at least 8 characters, including a letter and a number."
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
        <Field name="password" label="Password" error={state.fieldErrors.password}>
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
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  )
}
