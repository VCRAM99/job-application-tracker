import type { Metadata } from "next"

import { PageHeader, RecordState } from "@/components/records/fields"
import { TaskForm, emptyTaskForm } from "@/components/tracker/task-form"
import { listCompanyOptions } from "@/lib/records/data"
import { createTask } from "@/lib/records/tracker-actions"
import { listApplicationOptions } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Add task" }

export default async function NewTaskPage() {
  const [companies, applications] = await Promise.all([listCompanyOptions(), listApplicationOptions()])
  if (!companies.ok || !applications.ok) {
    return (
      <RecordState tone="error" title="Task form could not be loaded" description="Companies or applications could not be loaded." />
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Add task" description="Mark it done from the list when you finish. A done task stores the completion date." />
      <TaskForm
        action={createTask}
        values={emptyTaskForm}
        companies={companies.data}
        applications={applications.data}
        submitLabel="Create task"
        cancelHref="/tasks"
      />
    </div>
  )
}
