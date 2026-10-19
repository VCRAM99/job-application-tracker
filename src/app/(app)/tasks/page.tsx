import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader, RecordState } from "@/components/records/fields"
import { TaskFilters, TaskTable } from "@/components/tracker/lists"
import { Button } from "@/components/ui/button"
import { todayDate } from "@/lib/records/logic"
import { searchParamsToURL } from "@/lib/records/query"
import { filterTasks, isOverdue, parseTaskListQuery, sortTasks } from "@/lib/records/tracker"
import { listTasks } from "@/lib/records/tracker-data"

export const metadata: Metadata = { title: "Tasks" }

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseTaskListQuery(searchParamsToURL(await searchParams))
  const result = await listTasks()
  const today = todayDate()
  const overdue = result.ok
    ? result.data.filter((task) => task.status !== "done" && isOverdue(task.dueDate, today)).length
    : 0

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="Work tied to a company or application. Due dates before today stay highlighted until the task is done."
        action={<Button nativeButton={false} render={<Link href="/tasks/new" />}>Add task</Button>}
      />
      {result.ok ? (
        result.data.length === 0 ? (
          <RecordState
            title="No tasks yet"
            description="Add a task for a follow-up, thank-you note, or anything else you need to do."
            action={<Button nativeButton={false} render={<Link href="/tasks/new" />}>Add task</Button>}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground" role="status">
              {overdue === 0 ? "No overdue tasks." : `${overdue} overdue ${overdue === 1 ? "task" : "tasks"}.`}
            </p>
            <TaskFilters query={query} />
            {(() => {
              const ordered = sortTasks(filterTasks(result.data, query), query)
              return ordered.length === 0 ? (
                <RecordState
                  title="No matching tasks"
                  description="Try a different search or clear the filters."
                  action={<Button variant="outline" nativeButton={false} render={<Link href="/tasks" />}>Clear filters</Button>}
                />
              ) : (
                <TaskTable tasks={ordered} today={today} />
              )
            })()}
          </>
        )
      ) : (
        <RecordState
          tone="error"
          title="Tasks could not be loaded"
          description={
            result.error === "missing_table"
              ? "Tasks are not available yet. Apply the networking, tasks, and preparation migration, then reload."
              : "The task list could not be loaded. Refresh the page and try again."
          }
        />
      )}
    </div>
  )
}
