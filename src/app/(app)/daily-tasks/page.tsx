import type { Metadata } from "next"
import Link from "next/link"

import { Checklist } from "@/components/daily/checklist"
import { HealthPanel } from "@/components/daily/health-panel"
import { TimezoneSync } from "@/components/daily/timezone-sync"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { SCHEDULE_CHANGE_NOTE, isIsoDate, isScheduledOn, lastCompletedWeek, localDateInTimeZone, weekContaining, weeklyInsights } from "@/lib/daily/calendar"
import { getDailyPreference, getHealthBundle, listCompletions, listRecurringTasks } from "@/lib/daily/data"
import { addCalendarDays } from "@/lib/records/logic"

export const metadata: Metadata = { title: "Daily Tasks" }

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
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
  const completions = tasks.ok ? await listCompletions(addCalendarDays(week.start, -1), addCalendarDays(week.end, 1)) : null
  const scheduled = tasks.ok
    ? tasks.data
        .filter((task) => isScheduledOn({ ...task, status: task.status }, date, today))
        .map((task) => ({
          ...task,
          completed: completions?.ok ? completions.data.some((row) => row.taskId === task.id && row.localDate === date) : false,
        }))
    : []
  const insights = tasks.ok && completions?.ok ? weeklyInsights(tasks.data, completions.data, week) : []
  const healthFrom = addCalendarDays(today, -89)
  const healthStart = date < healthFrom ? date : healthFrom
  const healthEnd = date > today ? date : today
  const health = preference.data.healthTrackingEnabled ? await getHealthBundle(healthStart, healthEnd) : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
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
          <p className="text-sm text-muted-foreground">Timezone: {preference.data.timezone ?? "Detecting this browser…"} · Today is {today}.</p>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="text-sm">Date
              <input className="mt-1 block rounded-lg border bg-transparent px-2 py-1" type="date" name="date" defaultValue={date} />
            </label>
            <button className="h-8 rounded-lg border px-3 text-sm" type="submit">Show date</button>
          </form>
          <details className="surface p-4" open>
            <summary className="cursor-pointer text-sm font-medium">Weekly insights · {week.start} to {week.end}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{SCHEDULE_CHANGE_NOTE}</p>
            <div className="mt-3 flex gap-3 text-sm">
              <Link href={`/daily-tasks?date=${date}&week=${addCalendarDays(week.start, -7)}`}>Previous week</Link>
              <Link href={`/daily-tasks?date=${date}&week=${addCalendarDays(week.start, 7)}`}>Next week</Link>
            </div>
            {insights.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No recurring tasks were scheduled during this week.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {insights.map((item) => (
                  <li key={item.taskId} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{item.title}</span>
                    <span className="tabular-nums">{item.completed}/{item.scheduled}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <Checklist date={date} items={scheduled} />
          {tasks.data.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {tasks.data.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{task.title} · {task.status}</span>
                  <Link className="underline-offset-4 hover:underline" href={`/daily-tasks/${task.id}/edit`}>Edit</Link>
                </li>
              ))}
            </ul>
          ) : (
            <RecordState title="No daily tasks yet" description="Add a habit and choose the weekdays it should appear." />
          )}
        </>
      )}
      {health && health.ok ? (
        <HealthPanel
          date={date}
          today={today}
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
