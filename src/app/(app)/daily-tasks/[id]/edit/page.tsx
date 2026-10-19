import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RecurringTaskForm } from "@/components/daily/task-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { requireUser } from "@/lib/auth/session"
import { isMissingTable } from "@/lib/records/logic"
import { isUuid } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Edit daily task" }

export default async function EditDailyTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recurring_tasks")
    .select("id, title, description, weekdays, start_date, end_date, status")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()
  if (error && isMissingTable(error)) {
    return <RecordState tone="error" title="Daily tasks are not available yet" description="Apply the daily tasks migration, then reload." />
  }
  if (!data) notFound()
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader title="Edit daily task" description="Changing weekdays or dates keeps old completion records. Weekly insights follow the current schedule." />
      <RecurringTaskForm
        task={{
          id: data.id,
          title: data.title,
          description: data.description,
          weekdays: data.weekdays,
          startDate: data.start_date,
          endDate: data.end_date,
          status: data.status,
        }}
      />
    </div>
  )
}
