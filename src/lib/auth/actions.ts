"use server"

import { redirect } from "next/navigation"

import { mapAuthError } from "@/lib/auth/errors"
import type { AuthFormState } from "@/lib/auth/form-state"
import { safeNextPath } from "@/lib/auth/paths"
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/auth/schemas"
import { isDuplicateSignup } from "@/lib/auth/signup"
import { getSiteUrl } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

function invalidForm(error: Parameters<typeof fieldErrorsFrom>[0]): AuthFormState {
  return {
    status: "error",
    message: "Check the form and try again.",
    fieldErrors: fieldErrorsFrom(error),
  }
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

export async function login(formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  })

  if (!parsed.success) return invalidForm(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error),
      fieldErrors: {},
    }
  }

  redirect(safeNextPath(formValue(formData, "next")))
}

export async function signup(formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  })

  if (!parsed.success) return invalidForm(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=/dashboard`,
    },
  })

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error),
      fieldErrors: {},
    }
  }

  if (isDuplicateSignup(data.user)) {
    return {
      status: "error",
      message:
        "An account with this email already exists. Sign in or reset your password.",
      fieldErrors: {},
    }
  }

  if (data.session) {
    redirect("/dashboard")
  }

  return {
    status: "success",
    message:
      "Check your email for a confirmation link. You can sign in after you verify the address.",
    fieldErrors: {},
  }
}

export async function requestPasswordReset(
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formValue(formData, "email"),
  })

  if (!parsed.success) return invalidForm(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`,
  })

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error),
      fieldErrors: {},
    }
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, a reset link is on the way. The link expires after a short time.",
    fieldErrors: {},
  }
}

export async function resetPassword(formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formValue(formData, "password"),
    confirmPassword: formValue(formData, "confirmPassword"),
  })

  if (!parsed.success) return invalidForm(parsed.error)

  const supabase = await createClient()
  const tokenHash = formValue(formData, "token_hash")
  const type = formValue(formData, "type")

  if (tokenHash) {
    if (type !== "recovery") {
      return {
        status: "error",
        message: mapAuthError({
          message: "expired",
          code: "otp_expired",
        }),
        fieldErrors: {},
      }
    }

    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    })

    if (error) {
      return {
        status: "error",
        message: mapAuthError(error),
        fieldErrors: {},
      }
    }
  } else {
    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims) {
      return {
        status: "error",
        message: mapAuthError({
          message: "expired",
          code: "otp_expired",
        }),
        fieldErrors: {},
      }
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    return {
      status: "error",
      message: mapAuthError(error),
      fieldErrors: {},
    }
  }

  redirect("/dashboard")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
