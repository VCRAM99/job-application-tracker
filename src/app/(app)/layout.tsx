import type { Metadata } from "next"
import { Suspense } from "react"

import { AiAvailabilityProvider } from "@/components/ai/availability"
import { AppShell } from "@/components/shell/app-shell"
import { LoadingSpinner } from "@/components/shell/loading-spinner"
import { enabledProviders, managedOffered } from "@/lib/ai/flags"
import { requireUser } from "@/lib/auth/session"
import { visibleNavItems } from "@/lib/navigation"
import { analyzeAllowed, careerAllowed, jobsAllowedFor, resumesAllowed } from "@/lib/beta"

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
        career: (await careerAllowed()),
        jobs: jobsAllowedFor(user.id),
        analyze: (await analyzeAllowed()),
        resumes: (await resumesAllowed()),
      })}
    >
      <AiAvailabilityProvider value={{ managed: managedOffered(), providers: enabledProviders() }}>{children}</AiAvailabilityProvider>
    </AppShell>
  )
}
