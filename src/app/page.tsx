import { Suspense } from "react"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth/session"

export const instant = false

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      }
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
