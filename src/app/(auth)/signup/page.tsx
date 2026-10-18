import type { Metadata } from "next"

import { SignupForm } from "@/components/auth/signup-form"
import { signup } from "@/lib/auth/actions"

export const metadata: Metadata = { title: "Create account" }

export default function SignupPage() {
  return <SignupForm authenticate={signup} />
}
