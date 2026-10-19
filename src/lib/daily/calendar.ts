import { isRealIsoDate } from "@/lib/import/format"
import { addCalendarDays } from "@/lib/records/logic"

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export type RecurringTaskSchedule = {
  id: string
  title: string
  weekdays: number[]
  startDate: string | null
  endDate: string | null
  status: "active" | "paused"
}

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function localDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  if (!year || !month || !day) return "1970-01-01"
  return `${year}-${month}-${day}`
}

export function weekdayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return 1
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const day = utc.getUTCDay()
  return day === 0 ? 7 : day
}

export function isIsoDate(value: string): boolean {
  return isRealIsoDate(value)
}

export function compareIso(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function inDateRange(date: string, start: string | null, end: string | null): boolean {
  if (start && compareIso(date, start) < 0) return false
  if (end && compareIso(date, end) > 0) return false
  return true
}

export function isScheduledOn(
  task: RecurringTaskSchedule,
  date: string,
  today: string,
): boolean {
  if (!task.weekdays.includes(weekdayNumber(date))) return false
  if (!inDateRange(date, task.startDate, task.endDate)) return false
  if (task.status === "paused" && compareIso(date, today) >= 0) return false
  return true
}

export function lastCompletedWeek(today: string): { start: string; end: string } {
  const end = addCalendarDays(today, -weekdayNumber(today))
  return { start: addCalendarDays(end, -6), end }
}

export function weekContaining(date: string): { start: string; end: string } {
  const start = addCalendarDays(date, -(weekdayNumber(date) - 1))
  return { start, end: addCalendarDays(start, 6) }
}

export function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = start
  while (compareIso(cursor, end) <= 0 && dates.length < 400) {
    dates.push(cursor)
    cursor = addCalendarDays(cursor, 1)
  }
  return dates
}

export type WeekInsight = {
  taskId: string
  title: string
  completed: number
  scheduled: number
}

export function weeklyInsights(
  tasks: RecurringTaskSchedule[],
  completions: Array<{ taskId: string; localDate: string }>,
  week: { start: string; end: string },
): WeekInsight[] {
  const done = new Set(completions.map((row) => `${row.taskId}:${row.localDate}`))
  const days = datesInRange(week.start, week.end)
  return tasks
    .map((task) => {
      const scheduledDays = days.filter(
        (day) => task.weekdays.includes(weekdayNumber(day)) && inDateRange(day, task.startDate, task.endDate),
      )
      const uniqueDays = [...new Set(scheduledDays)]
      const completed = uniqueDays.filter((day) => done.has(`${task.id}:${day}`)).length
      return { taskId: task.id, title: task.title, completed, scheduled: uniqueDays.length }
    })
    .filter((row) => row.scheduled > 0)
}

/**
 * Weekly insights use the task's current weekdays and start/end dates.
 * Pause hides the task from today and future checklists only.
 * Completions stay stored if the schedule later changes, but a day that is
 * no longer a scheduled weekday or falls outside the current date range
 * is not counted as scheduled or missed.
 */
export const SCHEDULE_CHANGE_NOTE =
  "Weekly insights use the current weekdays and date range. Older completion records are kept, and days that are no longer scheduled are left out of both counts."
