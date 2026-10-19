import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { DetailList, PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { PREPARATION_CATEGORY_LABELS, PREPARATION_STATUS_LABELS } from "@/lib/records/constants"
import { deletePreparation } from "@/lib/records/tracker-actions"
import { getPreparation } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Preparation item" }

export default async function PreparationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getPreparation(id)
  if (!result.ok) {
    return <RecordState tone="error" title="Preparation item could not be loaded" description="Refresh the page and try again." />
  }
  if (!result.data) notFound()
  const item = result.data
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title={item.title}
        description={PREPARATION_CATEGORY_LABELS[item.category]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`/preparation/${item.id}/edit`} />}>Edit</Button>
            <DeleteRecordButton
              action={deletePreparation}
              id={item.id}
              label="Delete item"
              title={`Delete ${item.title}?`}
              description="This removes the preparation item."
            />
          </div>
        }
      />
      <DetailList
        items={[
          { label: "Category", value: PREPARATION_CATEGORY_LABELS[item.category] },
          { label: "Status", value: PREPARATION_STATUS_LABELS[item.status] },
          { label: "Target", value: item.targetDate ?? "—" },
          { label: "Completed", value: item.completedAt ?? "—" },
          {
            label: "Resource",
            value: item.resourceUrl ? (
              <a href={item.resourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{item.resourceUrl}</a>
            ) : "—",
          },
        ]}
      />
      {item.notes ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="text-sm leading-6 whitespace-pre-wrap">{item.notes}</p>
        </section>
      ) : null}
    </div>
  )
}
