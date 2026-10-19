import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageHeader, RecordState } from "@/components/records/fields"
import { PreparationForm } from "@/components/tracker/preparation-form"
import { updatePreparation } from "@/lib/records/tracker-actions"
import { getPreparation } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Edit preparation item" }

export default async function EditPreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getPreparation(id)
  if (!result.ok) {
    return <RecordState tone="error" title="Preparation item could not be loaded" description="Refresh the page and try again." />
  }
  if (!result.data) notFound()
  const item = result.data
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={`Edit ${item.title}`} description="Marking this completed stores today's date. Any other status clears that date." />
      <PreparationForm
        action={updatePreparation}
        id={item.id}
        submitLabel="Save item"
        cancelHref={`/preparation/${item.id}`}
        values={{
          title: item.title,
          category: item.category,
          status: item.status,
          targetDate: item.targetDate ?? "",
          resourceUrl: item.resourceUrl ?? "",
          notes: item.notes ?? "",
        }}
      />
    </div>
  )
}
