import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Dashboard" }

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="A snapshot of your search will live here: active applications, upcoming follow-ups, and preparation still to do."
      emptyTitle="No activity yet"
      emptyDescription="Once you add companies and applications, the latest movement in your search will show up here."
    />
  )
}
