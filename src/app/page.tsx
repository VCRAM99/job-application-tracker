import { Suspense } from "react"
import { redirect } from "next/navigation"

import { LoadingSpinner } from "@/components/shell/loading-spinner"
import { getCurrentUser } from "@/lib/auth/session"

export const instant = false

export default function HomePage() {
  return (
    <Suspense
      fallback={<LoadingSpinner label="Loading…" />}
    >
      <HomeRedirect />
    </Suspense>
  )
}

async function HomeRedirect() {
  const user = await getCurrentUser()
  redirect(user ? "/dashboard" : "/login")
  return null
}
