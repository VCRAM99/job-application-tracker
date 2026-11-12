"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { isIsoDate } from "@/lib/daily/calendar"
import { addCalendarDays } from "@/lib/records/logic"

export function formatDay(iso: string, style: "long" | "short" = "long"): string {
  const [year, month, day] = iso.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(style === "long" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)))
}

/**
 * ‹ date › with the native date picker behind the date: choosing a day navigates at once.
 * ←/→ on the keyboard are handled by the page (see DailyTasksApp).
 */
export function DayNav({ date, today, timezone, onChange }: { date: string; today: string; timezone: string | null; onChange: (date: string) => void }) {
  const isToday = date === today
  const relative = isToday ? "Today" : date === addCalendarDays(today, -1) ? "Yesterday" : date === addCalendarDays(today, 1) ? "Tomorrow" : null
  return (
    <nav aria-label="Day" className="flex items-center gap-1 sm:gap-2">
      <button
        type="button"
        className="pressable pressable-quiet inline-flex size-10 shrink-0 items-center justify-center rounded-full"
        aria-label="Previous day"
        title="Previous day (←)"
        onClick={() => onChange(addCalendarDays(date, -1))}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <label className="pressable pressable-quiet relative flex min-w-0 flex-1 cursor-pointer flex-col items-center rounded-xl px-3 py-1.5 text-center sm:flex-none sm:px-4">
        <span className="text-base font-semibold tracking-tight sm:text-lg">{formatDay(date, "short")}</span>
        <span className="text-xs text-muted-foreground">
          {relative ?? date.slice(0, 4)}
          {timezone ? ` · ${timezone}` : ""}
        </span>
        <input
          type="date"
          aria-label="Choose a date"
          value={date}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onClick={(event) => {
            // Open the picker on click where supported; elsewhere the focused input opens it.
            try {
              event.currentTarget.showPicker?.()
            } catch {}
          }}
          onChange={(event) => {
            if (isIsoDate(event.currentTarget.value)) onChange(event.currentTarget.value)
          }}
        />
      </label>
      <button
        type="button"
        className="pressable pressable-quiet inline-flex size-10 shrink-0 items-center justify-center rounded-full"
        aria-label="Next day"
        title="Next day (→)"
        onClick={() => onChange(addCalendarDays(date, 1))}
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
      {isToday ? null : (
        <button type="button" className="pressable pressable-quiet ml-1 rounded-full border px-3 py-1 text-xs" onClick={() => onChange(today)}>
          Today
        </button>
      )}
    </nav>
  )
}
