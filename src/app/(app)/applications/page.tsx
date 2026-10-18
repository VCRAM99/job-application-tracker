import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Applications" }

export default function ApplicationsPage() {
  return (
    <PlaceholderPage
      title="Applications"
      description="Track every role you apply to. A company can have more than one application."
      emptyTitle="No applications yet"
      emptyDescription="Application status, dates, and notes will be added in a later milestone."
    />
  )
}
