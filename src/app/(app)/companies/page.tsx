import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Companies" }

export default function CompaniesPage() {
  return (
    <PlaceholderPage
      title="Companies"
      description="Research targets will be stored here, including priority, industry, size, and location."
      emptyTitle="No companies yet"
      emptyDescription="Company records are planned for a later milestone. Each company will belong only to your account."
    />
  )
}
