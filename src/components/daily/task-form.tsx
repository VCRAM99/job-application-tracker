import { WEEKDAY_LABELS } from "@/lib/daily/calendar"
import { deleteRecurringTask, saveRecurringTask, setRecurringStatus } from "@/lib/daily/actions"
import { DeleteRecordButton } from "@/components/records/delete-record-button"

export function RecurringTaskForm({
  task,
}: {
  task?: {
    id: string
    title: string
    description: string | null
    weekdays: number[]
    startDate: string | null
    endDate: string | null
    status: "active" | "paused"
  }
}) {
  return (
    <div className="space-y-3">
    <form action={saveRecurringTask} className="surface flex flex-col gap-4 p-4">
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <input type="hidden" name="status" value={task?.status ?? "active"} />
      <label className="text-sm">Title
        <input name="title" required defaultValue={task?.title ?? ""} className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" />
      </label>
      <label className="text-sm">Description
        <textarea name="description" defaultValue={task?.description ?? ""} className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" rows={3} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm">Repeats</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, index) => (
            <label key={label} className="inline-flex items-center gap-1 text-sm">
              <input type="checkbox" name="weekdays" value={index + 1} defaultChecked={task ? task.weekdays.includes(index + 1) : index < 5} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Start date
          <input type="date" name="startDate" defaultValue={task?.startDate ?? ""} className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" />
        </label>
        <label className="text-sm">End date
          <input type="date" name="endDate" defaultValue={task?.endDate ?? ""} className="mt-1 w-full rounded-lg border bg-transparent px-2 py-1" />
        </label>
      </div>
      <button className="h-8 rounded-lg bg-primary px-3 text-sm text-primary-foreground" type="submit">{task ? "Save task" : "Create task"}</button>
      {task ? (
        <div className="flex flex-wrap gap-2">
          <DeleteRecordButton action={deleteRecurringTask} id={task.id} label="Delete task" title={`Delete ${task.title}?`} description="Completion history for this habit is deleted with it. Other records stay." />
        </div>
      ) : null}
    </form>
    {task ? (
      <form action={setRecurringStatus}>
        <input type="hidden" name="id" value={task.id} />
        <button className="h-8 rounded-lg border px-3 text-sm" type="submit" name="status" value={task.status === "paused" ? "active" : "paused"}>
          {task.status === "paused" ? "Resume" : "Pause"}
        </button>
      </form>
    ) : null}
    </div>
  )
}
