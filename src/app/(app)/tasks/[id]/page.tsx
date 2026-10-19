import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { DetailList, PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/records/constants"
import { todayDate } from "@/lib/records/logic"
import { deleteTask, setTaskCompletion } from "@/lib/records/tracker-actions"
import { isOverdue } from "@/lib/records/tracker"
import { getTask } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Task" }

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getTask(id)
  if (!result.ok) {
    return (
      <RecordState
        tone="error"
        title="Task could not be loaded"
        description="This task could not be loaded. Refresh the page and try again."
      />
    )
  }
  if (!result.data) notFound()
  const task = result.data
  const overdue = task.status !== "done" && isOverdue(task.dueDate, todayDate())

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title={task.title}
        description={TASK_STATUS_LABELS[task.status]}
        action={
          <div className="flex flex-wrap gap-2">
            <form action={setTaskCompletion}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="completed" value={task.status === "done" ? "false" : "true"} />
              <Button type="submit" variant="outline">{task.status === "done" ? "Mark incomplete" : "Mark complete"}</Button>
            </form>
            <Button variant="outline" nativeButton={false} render={<Link href={`/tasks/${task.id}/edit`} />}>Edit</Button>
            <DeleteRecordButton
              action={deleteTask}
              id={task.id}
              label="Delete task"
              title={`Delete ${task.title}?`}
              description="This removes the task. Linked companies and applications stay."
            />
          </div>
        }
      />
      <DetailList
        items={[
          { label: "Status", value: TASK_STATUS_LABELS[task.status] },
          { label: "Priority", value: TASK_PRIORITY_LABELS[task.priority] },
          { label: "Due", value: <span className={overdue ? "text-destructive" : undefined}>{task.dueDate ?? "—"}</span> },
          { label: "Completed", value: task.completedAt ?? "—" },
          {
            label: "Company",
            value: task.companyId ? <Link href={`/companies/${task.companyId}`} className="underline-offset-4 hover:underline">{task.companyName}</Link> : "—",
          },
          {
            label: "Application",
            value: task.applicationId ? <Link href={`/applications/${task.applicationId}`} className="underline-offset-4 hover:underline">{task.applicationTitle}</Link> : "—",
          },
        ]}
      />
      {task.description ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Description</h2>
          <p className="text-sm leading-6 whitespace-pre-wrap">{task.description}</p>
        </section>
      ) : null}
    </div>
  )
}
