import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Preparation" }

export default function PreparationPage() {
  return (
    <PlaceholderPage
      title="Preparation"
      description="Certifications and interview practice will be collected here as you prepare for conversations."
      emptyTitle="No preparation items yet"
      emptyDescription="Certification and interview practice records come in a later milestone."
    />
  )
}
