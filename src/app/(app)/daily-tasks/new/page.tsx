import type { Metadata } from "next"

import { RecurringTaskForm } from "@/components/daily/task-form"
import { PageHeader } from "@/components/records/fields"

export const metadata: Metadata = { title: "Add daily task" }

export default function NewDailyTaskPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader title="Add daily task" description="Choose the weekdays this habit should appear. Monday is the first day." />
      <RecurringTaskForm />
    </div>
  )
}
