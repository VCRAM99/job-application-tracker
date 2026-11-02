"use client"

import Link from "next/link"
import { startTransition, useOptimistic } from "react"

import { Button } from "@/components/ui/button"
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/records/constants"
import { setTaskCompletion } from "@/lib/records/tracker-actions"
import { isOverdue, type TaskRecord } from "@/lib/records/tracker"

/**
 * One task row. "Mark complete" shows Done at once; the saved status replaces
 * it when the server answers, so a failed update returns to the saved status.
 * Without JavaScript the form posts the server action as before.
 */
export function TaskRow({ task, today }: { task: TaskRecord; today: string }) {
  const [status, setStatus] = useOptimistic(task.status)
  const overdue = status !== "done" && isOverdue(task.dueDate, today)
  const completing = status !== "done"

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <Link href={`/tasks/${task.id}`} className="font-medium underline-offset-4 hover:underline">{task.title}</Link>
      </td>
      <td className="px-3 py-2">{TASK_STATUS_LABELS[status]}</td>
      <td className="px-3 py-2">{TASK_PRIORITY_LABELS[task.priority]}</td>
      <td className={`px-3 py-2 ${overdue ? "text-destructive" : ""}`}>{task.dueDate ?? "—"}</td>
      <td className="px-3 py-2">
        {task.applicationId ? (
          <Link href={`/applications/${task.applicationId}`} className="underline-offset-4 hover:underline">{task.applicationTitle}</Link>
        ) : task.companyId ? (
          <Link href={`/companies/${task.companyId}`} className="underline-offset-4 hover:underline">{task.companyName}</Link>
        ) : "—"}
      </td>
      <td className="px-3 py-2">
        <form
          action={setTaskCompletion}
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            startTransition(async () => {
              setStatus(completing ? "done" : "todo")
              await setTaskCompletion(data)
            })
          }}
        >
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="completed" value={completing ? "true" : "false"} />
          <Button type="submit" variant="outline" size="sm">
            {completing ? "Mark complete" : "Mark incomplete"}
          </Button>
        </form>
      </td>
    </tr>
  )
}
