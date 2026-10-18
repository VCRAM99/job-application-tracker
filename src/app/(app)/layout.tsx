import { Suspense } from "react"

import { AppShell } from "@/components/shell/app-shell"
import { requireUser } from "@/lib/auth/session"

export const instant = false

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-muted-foreground" role="status">Loading…</p>}>
      <ProtectedContent>{children}</ProtectedContent>
    </Suspense>
  )
}

async function ProtectedContent({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return <AppShell user={user}>{children}</AppShell>
}
