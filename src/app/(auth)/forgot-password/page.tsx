import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"
import { requestPasswordReset } from "@/lib/auth/actions"

export const metadata: Metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm requestReset={requestPasswordReset} />
}
