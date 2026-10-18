import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"
import { login } from "@/lib/auth/actions"
import { safeNextPath } from "@/lib/auth/paths"

export const metadata: Metadata = { title: "Sign in" }
export const instant = false

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const error = first(params.error)
  const notice =
    error === "expired"
      ? "This link is invalid or has expired. Request a new one and try again."
      : null

  return (
    <LoginForm
      authenticate={login}
      nextPath={safeNextPath(first(params.next))}
      notice={notice}
    />
  )
}
