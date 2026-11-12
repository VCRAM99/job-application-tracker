"use client"

import { startTransition, useCallback, useOptimistic, useReducer, useRef, useState } from "react"

import type { Result } from "@/lib/daily/live-actions"
import { mergeWindow, type AmountEntry, type DailyGoals, type DailyTask, type DailyWindow, type FoodEntry, type WeightEntry } from "@/lib/daily/model"

export type DailyState = { tasks: DailyTask[]; goals: DailyGoals; window: DailyWindow }

export type Rows = { food: FoodEntry; water: AmountEntry; sleep: AmountEntry; steps: AmountEntry; weight: WeightEntry }
export type EntryKind = keyof Rows

export type DailyAction =
  | { type: "completion"; key: string; done: boolean }
  | { type: "upsert"; kind: EntryKind; row: Rows[EntryKind]; replaces?: string }
  | { type: "remove"; kind: EntryKind; id: string }
  | { type: "goals"; goals: DailyGoals }
  | { type: "window"; window: DailyWindow }

/**
 * Every action can be applied twice with the same result. useOptimistic replays pending actions on
 * top of the confirmed state, so a confirmation that lands while its optimistic action is still
 * pending must not duplicate a row or flip a check twice.
 */
export function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case "completion": {
      const has = state.window.completions.includes(action.key)
      if (has === action.done) return state
      const completions = action.done ? [...state.window.completions, action.key] : state.window.completions.filter((key) => key !== action.key)
      return { ...state, window: { ...state.window, completions } }
    }
    case "upsert": {
      const rows = state.window[action.kind] as Array<{ id: string }>
      const kept = rows.filter((row) => row.id !== action.row.id && row.id !== action.replaces)
      return { ...state, window: { ...state.window, [action.kind]: [...kept, action.row] } }
    }
    case "remove": {
      const rows = state.window[action.kind] as Array<{ id: string }>
      return { ...state, window: { ...state.window, [action.kind]: rows.filter((row) => row.id !== action.id) } }
    }
    case "goals":
      return { ...state, goals: action.goals }
    case "window":
      return { ...state, window: mergeWindow(state.window, action.window) }
  }
}

export type Toast = { id: number; message: string; action?: { label: string; run: () => void } }

export const TEMP_PREFIX = "pending-"
export const isPending = (id: string) => id.startsWith(TEMP_PREFIX)
export const tempId = () => `${TEMP_PREFIX}${crypto.randomUUID()}`

/**
 * Confirmed state, the optimistic view of it, and `mutate`: show the change now, run the server
 * action, then either confirm it or let React drop the optimistic change and show a toast.
 */
export function useDailyStore(initial: DailyState) {
  const [state, dispatch] = useReducer(dailyReducer, initial)
  const [view, addOptimistic] = useOptimistic(state, dailyReducer)
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextToast = useRef(1)

  const notify = useCallback((message: string, action?: Toast["action"]) => {
    const id = nextToast.current++
    // Toasts dismiss themselves (see Toasts), pausing while hovered or focused.
    setToasts((current) => [...current.slice(-2), { id, message, action }])
  }, [])

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  const mutate = useCallback(
    <T,>(optimistic: DailyAction, run: () => Promise<Result<T>>, settle: (data: T) => DailyAction | null, fallback: string) => {
      startTransition(async () => {
        addOptimistic(optimistic)
        let result: Result<T>
        try {
          result = await run()
        } catch {
          result = { ok: false, message: fallback }
        }
        // Inside the same transition, so the confirmed state replaces the optimistic one in one render.
        startTransition(() => {
          if (result.ok) {
            const confirmed = settle(result.data)
            if (confirmed) dispatch(confirmed)
          } else {
            notify(result.message)
          }
        })
      })
    },
    [addOptimistic, notify],
  )

  const apply = useCallback((action: DailyAction) => startTransition(() => dispatch(action)), [])

  return { state, view, mutate, apply, toasts, notify, dismiss }
}
