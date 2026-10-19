import type { Metadata } from "next"

import { ImportPanel } from "@/components/import/import-panel"
import { PageHeader } from "@/components/records/fields"

export const metadata: Metadata = { title: "Import applications" }

export default function ImportApplicationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Import and export applications"
        description="Upload the official applications template. A company that is not already yours is created. Matching company, job title, and job URL are skipped and never overwritten."
      />
      <ImportPanel kind="applications" />
    </div>
  )
}
