import type { Metadata } from "next"
import { Suspense } from "react"

import { AppShell } from "@/components/shell/app-shell"
import { LoadingSpinner } from "@/components/shell/loading-spinner"
import { aiFeaturesEnabled } from "@/lib/ai/flags"
import { requireUser } from "@/lib/auth/session"
import { recommendedJobsEnabled } from "@/lib/jobs/flags"
import { visibleNavItems } from "@/lib/navigation"

export const instant = false

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<LoadingSpinner label="Loading…" />}>
      <ProtectedContent>{children}</ProtectedContent>
    </Suspense>
  )
}

async function ProtectedContent({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <AppShell
      user={user}
      items={visibleNavItems({
        career: aiFeaturesEnabled(),
        jobs: recommendedJobsEnabled(),
      })}
    >
      {children}
    </AppShell>
  )
}
