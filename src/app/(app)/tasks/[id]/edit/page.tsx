import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageHeader, RecordState } from "@/components/records/fields"
import { TaskForm } from "@/components/tracker/task-form"
import { listCompanyOptions } from "@/lib/records/data"
import { updateTask } from "@/lib/records/tracker-actions"
import { getTask, listApplicationOptions } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Edit task" }

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [task, companies, applications] = await Promise.all([
    getTask(id),
    listCompanyOptions(),
    listApplicationOptions(),
  ])
  if (!task.ok || !companies.ok || !applications.ok) {
    return <RecordState tone="error" title="Task could not be loaded" description="This task could not be loaded. Refresh the page and try again." />
  }
  if (!task.data) notFound()
  const record = task.data
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={`Edit ${record.title}`} description="Changing the status to Done sets the completion date. Any other status clears it." />
      <TaskForm
        action={updateTask}
        id={record.id}
        companies={companies.data}
        applications={applications.data}
        submitLabel="Save task"
        cancelHref={`/tasks/${record.id}`}
        values={{
          title: record.title,
          description: record.description ?? "",
          status: record.status,
          priority: record.priority,
          dueDate: record.dueDate ?? "",
          companyId: record.companyId ?? "",
          applicationId: record.applicationId ?? "",
        }}
      />
    </div>
  )
}
