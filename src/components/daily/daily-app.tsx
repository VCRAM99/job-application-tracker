"use client"

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { Checklist } from "@/components/daily/checklist"
import { DayNav } from "@/components/daily/day-nav"
import { FoodCard, SleepCard, StepsCard, WaterCard, WeightCard, type FoodSave } from "@/components/daily/health-cards"
import { HealthInsights, WeeklyInsights } from "@/components/daily/insights"
import { PreferencesPanel } from "@/components/daily/preferences-panel"
import { tempId, useDailyStore, type DailyAction, type DailyState, type EntryKind, type Rows } from "@/components/daily/store"
import { Toasts } from "@/components/daily/toasts"
import { localDateInTimeZone } from "@/lib/daily/calendar"
import { calorieDirection, proteinDirection } from "@/lib/daily/goals"
import { displayToKg } from "@/lib/daily/health"
import { addCalendarDays } from "@/lib/records/logic"
import {
  deleteHealthEntry,
  loadDailyRange,
  saveAmountEntry,
  saveDailyPreferences,
  saveFoodEntry,
  saveWeightEntry,
  setTaskCompletion,
  type AmountKind,
  type Result,
} from "@/lib/daily/live-actions"
import { checklistFor, completionKey, inWindow, insightsFor, onDate, rangeToLoad, type AmountEntry, type DailyGoals, type FoodEntry, type WeightEntry } from "@/lib/daily/model"

function subscribeToClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000)
  document.addEventListener("visibilitychange", onChange)
  window.addEventListener("focus", onChange)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener("visibilitychange", onChange)
    window.removeEventListener("focus", onChange)
  }
}

/**
 * Today in the user's saved timezone (or the browser's until one is saved). The server's value is
 * used for the first render; afterwards it follows the clock, so a page left open past midnight
 * moves on to the new day.
 */
function useToday(timezone: string | null, serverToday: string): string {
  return useSyncExternalStore(
    subscribeToClock,
    () => localDateInTimeZone(new Date(), timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"),
    () => serverToday,
  )
}

/** ←/→ change day unless the user is typing or a control that uses the arrows has focus. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.closest('[role="dialog"], [role="radiogroup"], [role="slider"]') != null
}

export function DailyTasksApp({
  initial,
  serverToday,
  timezone,
  healthEnabled,
  manage,
}: {
  initial: DailyState
  serverToday: string
  timezone: string | null
  healthEnabled: boolean
  manage: ReactNode
}) {
  const { state, view, mutate, apply, toasts, notify, dismiss } = useDailyStore(initial)
  const today = useToday(timezone, serverToday)
  // null = "today", so the page follows the date across midnight; never kept in the URL or storage.
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? today
  const loading = useRef(new Set<string>())

  function ensureLoaded(date: string) {
    const range = rangeToLoad(state.window, date)
    if (!range) return
    const key = `${range.from}:${range.to}`
    if (loading.current.has(key)) return
    loading.current.add(key)
    void loadDailyRange(range.from, range.to)
      .then((result) => {
        if (result.ok) apply({ type: "window", window: result.data })
        else notify(result.message)
      })
      .catch(() => notify("Those days could not be loaded."))
      .finally(() => loading.current.delete(key))
  }

  function goTo(date: string) {
    // An urgent update, not a transition: the new day renders in the next frame.
    setPicked(date === today ? null : date)
    ensureLoaded(date)
  }

  // The key handler reads the current day from component state, never from the DOM: Next can keep
  // a hidden copy of this page mounted (Activity), and a DOM lookup could find that copy first.
  const latest = useRef({ goTo, selected })
  useEffect(() => {
    latest.current = { goTo, selected }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      const { goTo: go, selected: current } = latest.current
      go(addCalendarDays(current, event.key === "ArrowLeft" ? -1 : 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const ready = inWindow(view.window, selected)
  const goals = view.goals
  const hidden = new Set(goals.hiddenMetrics)
  const completions = new Set(view.window.completions)
  const checklist = checklistFor(view.tasks, completions, selected, today)
  const insights = insightsFor(view.tasks, view.window.completions, selected)

  const toggle = (item: { id: string; completed: boolean }) => {
    const action: DailyAction = { type: "completion", key: completionKey(item.id, selected), done: !item.completed }
    mutate(action, () => setTaskCompletion(item.id, selected, !item.completed), () => action, "The task could not be updated.")
  }

  function saveRow<K extends EntryKind>(kind: K, row: Rows[K], run: () => Promise<Result<Rows[K]>>) {
    const replaces = row.id
    mutate({ type: "upsert", kind, row }, run, (saved) => ({ type: "upsert", kind, row: saved, replaces }), "That entry could not be saved.")
  }

  function remove(kind: EntryKind, row: { id: string }, undo: () => void, label: string) {
    mutate(
      { type: "remove", kind, id: row.id },
      () => deleteHealthEntry(kind, row.id),
      () => {
        notify(`${label} deleted.`, { label: "Undo", run: undo })
        return { type: "remove", kind, id: row.id }
      },
      "That entry could not be deleted.",
    )
  }

  const saveFood = (input: FoodSave) => {
    const existing = input.id ? view.window.food.find((entry) => entry.id === input.id) : undefined
    const row: FoodEntry = {
      id: existing?.id ?? tempId(),
      date: existing?.date ?? selected,
      description: input.description.trim() || null,
      calories: input.calories,
      protein: Math.round(input.protein * 10) / 10,
      entryTime: input.entryTime || null,
    }
    saveRow("food", row, () => saveFoodEntry({ id: existing?.id, date: row.date, description: input.description, calories: input.calories, protein: input.protein, entryTime: input.entryTime }))
  }

  const saveAmount = (kind: AmountKind, amount: number, id?: string) => {
    const existing = id ? (view.window[kind] as AmountEntry[]).find((entry) => entry.id === id) : undefined
    const row: AmountEntry = { id: existing?.id ?? tempId(), date: existing?.date ?? selected, amount }
    saveRow(kind, row, () => saveAmountEntry(kind, { id: existing?.id, date: row.date, amount }))
  }

  const saveWeight = (value: number, id?: string, onDay?: string) => {
    const kg = displayToKg(value, goals.weightUnit)
    const row: WeightEntry = { id: id ?? tempId(), date: onDay ?? selected, kg }
    saveRow("weight", row, () => saveWeightEntry({ id, date: row.date, kg }))
  }

  const savePreferences = (next: DailyGoals) =>
    mutate({ type: "goals", goals: next }, () => saveDailyPreferences(next), (saved) => ({ type: "goals", goals: saved }), "Preferences could not be saved.")

  const day = {
    food: onDate(view.window.food, selected),
    water: onDate(view.window.water, selected),
    sleep: onDate(view.window.sleep, selected),
    steps: onDate(view.window.steps, selected),
  }
  const showHealth = healthEnabled && hidden.size < 5
  const series = {
    calories: view.window.food.map((entry) => ({ date: entry.date, value: entry.calories })),
    protein: view.window.food.map((entry) => ({ date: entry.date, value: entry.protein })),
    water: view.window.water.map((entry) => ({ date: entry.date, value: entry.amount })),
    sleep: view.window.sleep.map((entry) => ({ date: entry.date, value: entry.amount })),
    steps: view.window.steps.map((entry) => ({ date: entry.date, value: entry.amount })),
    weight: view.window.weight.map((entry) => ({ date: entry.date, value: entry.kg })),
  }

  return (
    <div className="flex flex-col gap-8" data-selected-date={selected} data-today={today}>
      <DayNav date={selected} today={today} timezone={timezone} onChange={goTo} />

      {!ready ? (
        <div data-day-loading className="flex flex-col gap-2" aria-busy="true" aria-label="Loading this day">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : (
        <>
          <section aria-labelledby="checklist-heading" className="flex flex-col gap-3">
            <h2 id="checklist-heading" className="text-sm font-medium">Checklist</h2>
            <Checklist items={checklist} onToggle={toggle} />
          </section>

          {showHealth ? (
            <section aria-labelledby="health-heading" className="flex flex-col gap-3">
              <h2 id="health-heading" className="text-sm font-medium">Health</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {hidden.has("food") ? null : (
                  <FoodCard
                    entries={day.food}
                    calorieTarget={goals.calorieTarget}
                    proteinTarget={goals.proteinTarget}
                    calorieDirection={calorieDirection(goals.goalMode)}
                    proteinDirection={proteinDirection(goals.goalMode, goals.proteinDirection)}
                    onSave={saveFood}
                    onDelete={(entry) => remove("food", entry, () => saveFood({ description: entry.description ?? "", calories: entry.calories, protein: entry.protein, entryTime: entry.entryTime ?? "" }), entry.description || "Food entry")}
                    onInvalid={notify}
                  />
                )}
                {hidden.has("water") ? null : <WaterCard entries={day.water} goal={goals.waterGoalMl} increment={goals.waterIncrementMl} onAdd={(amount) => saveAmount("water", amount)} onInvalid={notify} />}
                {hidden.has("sleep") ? null : (
                  <SleepCard entries={day.sleep} target={goals.sleepTargetMinutes} onSave={(minutes, id) => saveAmount("sleep", minutes, id)} onDelete={(entry) => remove("sleep", entry, () => saveAmount("sleep", entry.amount), "Sleep entry")} onInvalid={notify} />
                )}
                {hidden.has("steps") ? null : (
                  <StepsCard entries={day.steps} target={goals.stepTarget} onSave={(steps, id) => saveAmount("steps", steps, id)} onDelete={(entry) => remove("steps", entry, () => saveAmount("steps", entry.amount), "Step entry")} onInvalid={notify} />
                )}
                {hidden.has("weight") ? null : (
                  <WeightCard
                    entries={view.window.weight}
                    date={selected}
                    unit={goals.weightUnit}
                    onSave={saveWeight}
                    onDelete={(entry) =>
                      remove("weight", entry, () => saveRow("weight", { ...entry, id: tempId() }, () => saveWeightEntry({ date: entry.date, kg: entry.kg })), "Weight")
                    }
                    onInvalid={notify}
                  />
                )}
              </div>
            </section>
          ) : null}
        </>
      )}

      {manage}

      <div className={`grid gap-3 ${showHealth ? "lg:grid-cols-2" : ""}`}>
        {showHealth ? <HealthInsights today={today} weightUnit={goals.weightUnit} hidden={goals.hiddenMetrics} series={series} /> : null}
        <WeeklyInsights insights={insights} />
      </div>

      <PreferencesPanel goals={goals} healthEnabled={healthEnabled} onChange={savePreferences} />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  )
}
