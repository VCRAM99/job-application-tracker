import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"

import { Checklist } from "@/components/daily/checklist"
import { Disclosure } from "@/components/daily/disclosure"
import { HealthPanel } from "@/components/daily/health-panel"
import { TimezoneSync } from "@/components/daily/timezone-sync"
import { PageHeader, RecordState } from "@/components/records/fields"
import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { Button } from "@/components/ui/button"
import { SCHEDULE_CHANGE_NOTE, WEEKDAY_LABELS, isIsoDate, isScheduledOn, lastCompletedWeek, localDateInTimeZone, weekContaining, weeklyInsights } from "@/lib/daily/calendar"
import { deleteRecurringTask, setRecurringStatus } from "@/lib/daily/actions"
import { getDailyPreference, getHealthBundle, listCompletions, listRecurringTasks } from "@/lib/daily/data"
import { addCalendarDays } from "@/lib/records/logic"

export const metadata: Metadata = { title: "Daily Tasks" }

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export default async function DailyTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const preference = await getDailyPreference()
  if (!preference.ok) {
    return (
      <RecordState
        tone="error"
        title="Daily tasks could not be loaded"
        description={
          preference.error === "missing_table"
            ? "Apply the daily tasks migration, then reload. Nothing else in the app is affected."
            : "Refresh the page and try again."
        }
      />
    )
  }
  const zone = preference.data.timezone && preference.data.timezone.length > 0 ? preference.data.timezone : "UTC"
  const today = localDateInTimeZone(new Date(), zone)
  const date = isIsoDate(first(params.date)) ? first(params.date) : today
  const requestedWeek = first(params.week)
  const week = isIsoDate(requestedWeek) ? weekContaining(requestedWeek) : lastCompletedWeek(today)
  const tasks = await listRecurringTasks()
  const completionStart = date < week.start ? date : week.start
  const completionEnd = date > week.end ? date : week.end
  const completions = tasks.ok ? await listCompletions(completionStart, completionEnd) : null
  const scheduled = tasks.ok
    ? tasks.data
        .filter((task) => isScheduledOn(task, date, today))
        .map((task) => ({
          ...task,
          completed: completions?.ok ? completions.data.some((row) => row.taskId === task.id && row.localDate === date) : false,
        }))
    : []
  const insights = tasks.ok && completions?.ok ? weeklyInsights(tasks.data, completions.data, week) : []
  const insightCompleted = insights.reduce((total, item) => total + item.completed, 0)
  const insightScheduled = insights.reduce((total, item) => total + item.scheduled, 0)
  const healthFrom = addCalendarDays(today, -89)
  const healthStart = date < healthFrom ? date : healthFrom
  const healthEnd = date > today ? date : today
  const health = preference.data.healthTrackingEnabled ? await getHealthBundle(healthStart, healthEnd) : null
  const healthOpen = (await cookies()).get("daily_health_open")?.value !== "0"
  const weekQuery = requestedWeek ? `&week=${week.start}` : ""

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <TimezoneSync timezone={preference.data.timezone} />
      <PageHeader
        title="Daily Tasks"
        description="Recurring habits for the selected local date. One-time job-search work stays on Tasks."
        action={<Button nativeButton={false} render={<Link href="/daily-tasks/new" />}>Add daily task</Button>}
      />
      {!tasks.ok ? (
        <RecordState tone="error" title="Daily tasks could not be loaded" description="Apply the daily tasks migration, then reload." />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Selected date</p>
                <p className="mt-1 text-lg font-medium tracking-tight">{formatDay(date)}</p>
                <p className="text-sm text-muted-foreground">
                  {preference.data.timezone ?? "Detecting this browser…"}
                  {date === today ? " · Today" : ""}
                </p>
              </div>
              <form className="flex flex-wrap items-center gap-2" method="get">
                {requestedWeek ? <input type="hidden" name="week" value={week.start} /> : null}
                <Link className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm" href={`/daily-tasks?date=${addCalendarDays(date, -1)}${weekQuery}`}>Previous day</Link>
                <label className="sr-only" htmlFor="daily-date">Date</label>
                <input id="daily-date" className="field-control w-auto" type="date" name="date" defaultValue={date} />
                <button className="pressable pressable-quiet h-9 rounded-lg border px-3 text-sm" type="submit">Show date</button>
                <Link className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm" href={`/daily-tasks?date=${addCalendarDays(date, 1)}${weekQuery}`}>Next day</Link>
              </form>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Checklist</h2>
            <Checklist date={date} items={scheduled} />
          </section>
          <Disclosure title="Manage recurring tasks" summary={tasks.data.length === 1 ? "1 task" : `${tasks.data.length} tasks`}>
            {tasks.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring tasks yet. Add a habit and choose the weekdays it should appear.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.data.map((task) => (
                  <li key={task.id} className="flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{task.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.weekdays.map((day) => WEEKDAY_LABELS[day - 1]).join(" · ")}
                        {" · "}
                        {task.status === "paused" ? "Paused" : "Active"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm" href={`/daily-tasks/${task.id}/edit`}>Edit</Link>
                      <form action={setRecurringStatus}>
                        <input type="hidden" name="id" value={task.id} />
                        <button className="pressable pressable-quiet h-9 rounded-lg border px-3 text-sm" type="submit" name="status" value={task.status === "paused" ? "active" : "paused"}>
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
          <Disclosure
            title="Weekly Insights"
            summary={`${week.start} – ${week.end}${insights.length ? ` · ${insightCompleted}/${insightScheduled}` : " · Nothing scheduled"}`}
          >
            <p className="text-sm text-muted-foreground">{SCHEDULE_CHANGE_NOTE}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm" href={`/daily-tasks?date=${date}&week=${addCalendarDays(week.start, -7)}`}>Previous week</Link>
              <Link className="pressable pressable-quiet inline-flex h-9 items-center rounded-lg border px-3 text-sm" href={`/daily-tasks?date=${date}&week=${addCalendarDays(week.start, 7)}`}>Next week</Link>
            </div>
            {insights.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No recurring tasks were scheduled during this week.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {insights.map((item) => (
                  <li key={item.taskId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words">{item.title}</span>
                      <span className="tabular-nums">{item.completed}/{item.scheduled}</span>
                    </div>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="meter"
                      aria-label={`${item.title} completed`}
                      aria-valuemin={0}
                      aria-valuemax={item.scheduled}
                      aria-valuenow={item.completed}
                      aria-valuetext={`${item.completed} of ${item.scheduled} scheduled days`}
                    >
                      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${item.scheduled === 0 ? 0 : (item.completed / item.scheduled) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>
        </>
      )}
      {health && health.ok ? (
        <HealthPanel
          date={date}
          today={today}
          defaultOpen={healthOpen}
          goals={health.data.goals}
          food={health.data.food.filter((row) => row.local_date === date).map((row) => ({
            id: row.id,
            description: row.description,
            calories: row.calories,
            protein: Number(row.protein),
            entryTime: row.entry_time,
          }))}
          water={health.data.water.filter((row) => row.local_date === date).map((row) => ({ id: row.id, amount: row.amount_ml }))}
          sleep={health.data.sleep.filter((row) => row.local_date === date).map((row) => ({ id: row.id, amount: row.minutes }))}
          steps={health.data.steps.filter((row) => row.local_date === date).map((row) => ({ id: row.id, amount: row.steps }))}
          weight={health.data.weight.map((row) => ({ id: row.id, measuredOn: row.measured_on, weightKg: Number(row.weight_kg) }))}
          chart={{
            calories: health.data.food.map((row) => ({ date: row.local_date, value: row.calories })),
            protein: health.data.food.map((row) => ({ date: row.local_date, value: Number(row.protein) })),
            water: health.data.water.map((row) => ({ date: row.local_date, value: row.amount_ml })),
            sleep: health.data.sleep.map((row) => ({ date: row.local_date, value: row.minutes })),
            steps: health.data.steps.map((row) => ({ date: row.local_date, value: row.steps })),
            weight: health.data.weight.map((row) => ({ date: row.measured_on, value: Number(row.weight_kg) })),
          }}
        />
      ) : null}
      {preference.data.healthTrackingEnabled && health && !health.ok ? (
        <RecordState tone="error" title="Health tracking could not be loaded" description="Apply the daily tasks migration, then reload. Saved health data is not shown until then." />
      ) : null}
    </div>
  )
}
