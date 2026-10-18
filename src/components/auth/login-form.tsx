"use client"

import Link from "next/link"
import { useActionState } from "react"

import { AuthFrame, Field, FormStatus } from "@/components/auth/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuthFormState } from "@/lib/auth/form-state"
import { initialAuthFormState } from "@/lib/auth/form-state"
import { fieldErrorsFrom, loginSchema } from "@/lib/auth/schemas"

export function LoginForm({
  authenticate,
  nextPath,
  notice,
}: {
  authenticate: (formData: FormData) => Promise<AuthFormState>
  nextPath: string
  notice: string | null
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: AuthFormState, formData: FormData) => {
      const parsed = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
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

  return (
    <AuthFrame
      title="Sign in"
      description="Use the email and password for your job search account."
    >
      {notice ? (
        <p className="rounded-lg border px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <form action={formAction} className="space-y-4" noValidate>
        <FormStatus state={state} />
        <input type="hidden" name="next" value={nextPath} />
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
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors.password)}
            aria-describedby={
              state.fieldErrors.password ? "password-error" : undefined
            }
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="underline underline-offset-4">
          Forgot password
        </Link>
        <p className="text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </AuthFrame>
  )
}
