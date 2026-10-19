import type { Metadata } from "next"

import { PageHeader } from "@/components/records/fields"
import { PreparationForm, emptyPreparationForm } from "@/components/tracker/preparation-form"
import { createPreparation } from "@/lib/records/tracker-actions"

export const metadata: Metadata = { title: "Add preparation item" }

export default function NewPreparationPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Add preparation item" description="Use any title you want. Completed items record the day you mark them completed." />
      <PreparationForm
        action={createPreparation}
        values={emptyPreparationForm}
        submitLabel="Create item"
        cancelHref="/preparation"
      />
    </div>
  )
}
