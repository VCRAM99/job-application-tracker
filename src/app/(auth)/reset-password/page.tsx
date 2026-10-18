import type { Metadata } from "next"
import Link from "next/link"

import { AuthFrame } from "@/components/auth/auth-frame"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { resetPassword } from "@/lib/auth/actions"
import { getCurrentUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Reset password" }
export const instant = false

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const tokenHash = first(params.token_hash) ?? null
  const type = first(params.type) ?? null
  const user = tokenHash ? null : await getCurrentUser()

  if (!tokenHash && !user) {
    return (
      <AuthFrame
        title="Reset link expired"
        description="This link is invalid or has already been used. Request a new password reset email."
      >
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          Request a new link
        </Link>
      </AuthFrame>
    )
  }

  return (
    <ResetPasswordForm
      updatePassword={resetPassword}
      tokenHash={tokenHash}
      type={type}
    />
  )
}
