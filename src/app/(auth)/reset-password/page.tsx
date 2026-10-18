import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"

import { isRecoveryProof } from "@/lib/auth/access"
import { AuthFrame } from "@/components/auth/auth-frame"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { resetPassword } from "@/lib/auth/actions"
import { RECOVERY_COOKIE } from "@/lib/auth/recovery-cookie"

export const metadata: Metadata = { title: "Reset password" }
export const instant = false

export default async function ResetPasswordPage() {
  const tokenHash = (await cookies()).get(RECOVERY_COOKIE)?.value ?? ""

  if (!isRecoveryProof(tokenHash, "recovery")) {
    return (
      <AuthFrame
        title="Reset link expired"
        description="This link is invalid or has already been used. Request a new password reset email. A signed-in session is not enough to reset a password here."
      >
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          Request a new link
        </Link>
      </AuthFrame>
    )
  }

  return <ResetPasswordForm updatePassword={resetPassword} />
}
