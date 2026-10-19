import type { Metadata } from "next"

import { SignupForm } from "@/components/auth/signup-form"
import { signup } from "@/lib/auth/actions"

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a Job Tracker account. Email confirmation is required before you can sign in.",
}

export default function SignupPage() {
  return <SignupForm authenticate={signup} />
}
