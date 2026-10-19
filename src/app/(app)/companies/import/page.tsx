import type { Metadata } from "next"

import { ImportPanel } from "@/components/import/import-panel"
import { PageHeader } from "@/components/records/fields"

export const metadata: Metadata = { title: "Import companies" }

export default function ImportCompaniesPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Import and export companies"
        description="Upload the official companies template. Duplicate names, ignoring case and extra spaces, are skipped. Invalid rows cancel the whole import."
      />
      <ImportPanel kind="companies" />
    </div>
  )
}
