import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Networking" }

export default function NetworkingPage() {
  return (
    <PlaceholderPage
      title="Networking"
      description="Keep contacts, referrals, and follow-ups attached to the companies you are researching."
      emptyTitle="No contacts yet"
      emptyDescription="Networking records are not stored yet. This page is a placeholder for the next milestone."
    />
  )
}
