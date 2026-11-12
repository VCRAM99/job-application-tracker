import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { DailyTasksApp } from "@/components/daily/daily-app"
import { Disclosure } from "@/components/daily/disclosure"
import { TimezoneSync } from "@/components/daily/timezone-sync"
import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { deleteRecurringTask, setRecurringStatus } from "@/lib/daily/actions"
import { WEEKDAY_LABELS, localDateInTimeZone } from "@/lib/daily/calendar"
import { getDailyPreference, listRecurringTasks, loadDailyGoals, loadDailyWindow } from "@/lib/daily/data"
import { initialRange } from "@/lib/daily/model"
import { addCalendarDays } from "@/lib/records/logic"

export const metadata: Metadata = { title: "Daily Tasks" }

/**
 * Always opens on today in the user's timezone: the selected day is client state only, never in
 * the URL or storage. One parallel batch loads everything for the window around today (completions
 * and health entries), so changing day in the browser needs no request. The window starts a day
 * wider than needed on each side, because "today" depends on the timezone read in the same batch.
 */
export default async function DailyTasksPage() {
  // Per-request page: today depends on the clock, so read it only after opting out of prerendering.
  await connection()
  const utcToday = new Date().toISOString().slice(0, 10)
  const range = initialRange(utcToday)
  // Health rows load in the same batch (no wait for the preference) and are dropped below when
  // health tracking is off, so they never reach the browser.
  const [preference, tasks, goals, loaded] = await Promise.all([
    getDailyPreference(),
    listRecurringTasks(),
    loadDailyGoals(),
    loadDailyWindow(addCalendarDays(range.from, -1), addCalendarDays(range.to, 1), true),
  ])

  if (!preference.ok || !tasks.ok) {
    const missing = (!preference.ok && preference.error === "missing_table") || (!tasks.ok && tasks.error === "missing_table")
    return (
      <RecordState
        tone="error"
        title="Daily tasks could not be loaded"
        description={missing ? "Apply the daily tasks migration, then reload. Nothing else in the app is affected." : "Refresh the page and try again."}
      />
    )
  }

  const healthEnabled = preference.data.healthTrackingEnabled
  const window = loaded.ok && !healthEnabled ? { ok: true as const, data: { ...loaded.data, food: [], water: [], sleep: [], steps: [], weight: [] } } : loaded
  const timezone = preference.data.timezone && preference.data.timezone.length > 0 ? preference.data.timezone : null
  const today = localDateInTimeZone(new Date(), timezone ?? "UTC")

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-20">
      <TimezoneSync timezone={preference.data.timezone} />
      <PageHeader
        title="Daily Tasks"
        help="Recurring habits and optional health notes for one day. Use ‹ › or the ← → keys to change day; the gear button holds targets and what to show."
        action={<Button nativeButton={false} render={<Link href="/daily-tasks/new" />}>Add daily task</Button>}
      />
      {!window.ok ? (
        <RecordState
          tone="error"
          title={healthEnabled ? "Health tracking could not be loaded" : "Completions could not be loaded"}
          description="Apply the daily tasks migration, then reload. Saved data is not shown until then."
        />
      ) : (
        <DailyTasksApp
          initial={{
            tasks: tasks.data.map((task) => ({ ...task, description: task.description ?? null })),
            goals: goals.ok ? goals.data : { calorieTarget: null, proteinTarget: null, waterGoalMl: null, waterIncrementMl: 250, sleepTargetMinutes: null, stepTarget: null, weightUnit: "kg", goalMode: "bulk", proteinDirection: "follow", hiddenMetrics: [] },
            window: window.data,
          }}
          serverToday={today}
          timezone={timezone}
          healthEnabled={healthEnabled && goals.ok}
          manage={
            <Disclosure title="Manage recurring tasks" summary={tasks.data.length === 1 ? "1 task" : `${tasks.data.length} tasks`}>
              {tasks.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recurring tasks yet. Add a habit and choose the weekdays it should appear.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {tasks.data.map((task) => (
                    <li key={task.id} className="flex flex-col gap-2 rounded-lg px-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{task.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {task.weekdays.map((day) => WEEKDAY_LABELS[day - 1]).join(" · ")} · {task.status === "paused" ? "Paused" : "Active"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Link className="pressable pressable-quiet inline-flex h-8 items-center rounded-lg px-2.5 text-sm" href={`/daily-tasks/${task.id}/edit`}>Edit</Link>
                        <form action={setRecurringStatus}>
                          <input type="hidden" name="id" value={task.id} />
                          <button className="pressable pressable-quiet h-8 rounded-lg px-2.5 text-sm" type="submit" name="status" value={task.status === "paused" ? "active" : "paused"}>
                            {task.status === "paused" ? "Resume" : "Pause"}
                          </button>
                        </form>
                        <DeleteRecordButton action={deleteRecurringTask} id={task.id} label="Delete" title={`Delete ${task.title}?`} description="Completion history for this habit is deleted with it." />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>
          }
        />
      )}
    </div>
  )
}
