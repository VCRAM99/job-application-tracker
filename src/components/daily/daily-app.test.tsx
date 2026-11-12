import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DailyState } from "@/components/daily/store"
import type { DailyGoals } from "@/lib/daily/model"

const actions = vi.hoisted(() => ({
  setTaskCompletion: vi.fn(),
  saveFoodEntry: vi.fn(),
  saveAmountEntry: vi.fn(),
  saveWeightEntry: vi.fn(),
  deleteHealthEntry: vi.fn(),
  saveDailyPreferences: vi.fn(),
  loadDailyRange: vi.fn(),
}))
vi.mock("@/lib/daily/live-actions", () => actions)
vi.mock("next/dynamic", () => ({ default: () => () => null }))

const TODAY = "2026-11-12"
const goals: DailyGoals = { calorieTarget: 2000, proteinTarget: 150, waterGoalMl: 2000, waterIncrementMl: 250, sleepTargetMinutes: 480, stepTarget: 8000, weightUnit: "kg", goalMode: "bulk", proteinDirection: "follow", hiddenMetrics: [] }
const initial = (): DailyState => ({
  tasks: [
    { id: "11111111-1111-4111-8111-111111111111", title: "Stretch", description: null, weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: null, endDate: null, status: "active" },
    { id: "22222222-2222-4222-8222-222222222222", title: "Read", description: "20 pages", weekdays: [4], startDate: null, endDate: null, status: "active" },
  ],
  goals,
  window: { from: "2026-08-14", to: "2026-11-26", completions: [], food: [{ id: "f1", date: TODAY, description: "Oatmeal", calories: 1700, protein: 60, entryTime: "08:00" }], water: [], sleep: [], steps: [], weight: [] },
})

/** A promise the test resolves by hand, to look at the page while a save is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderApp(state = initial()) {
  const { DailyTasksApp } = await import("@/components/daily/daily-app")
  return render(<DailyTasksApp initial={state} serverToday={TODAY} timezone="UTC" healthEnabled manage={null} />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`))
})
afterEach(() => {
  vi.useRealTimers()
  for (const fn of Object.values(actions)) fn.mockReset()
})

describe("Daily Tasks page", () => {
  it("opens on today and shows the day's checklist", async () => {
    await renderApp()
    expect(document.querySelector("[data-selected-date]")?.getAttribute("data-selected-date")).toBe(TODAY)
    expect(screen.getByRole("checkbox", { name: "Stretch" }).getAttribute("aria-checked")).toBe("false")
    // Thursday: both habits are scheduled.
    expect(screen.getByRole("checkbox", { name: "Read" })).toBeTruthy()
  })

  it("checks a habit before the server answers, and keeps it once confirmed", async () => {
    const save = deferred<{ ok: true; data: null }>()
    actions.setTaskCompletion.mockReturnValue(save.promise)
    await renderApp()
    fireEvent.click(screen.getByRole("checkbox", { name: "Stretch" }))
    expect(screen.getByRole("checkbox", { name: "Stretch" }).getAttribute("aria-checked")).toBe("true")
    expect(actions.setTaskCompletion).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", TODAY, true)
    await act(async () => save.resolve({ ok: true, data: null }))
    expect(screen.getByRole("checkbox", { name: "Stretch" }).getAttribute("aria-checked")).toBe("true")
  })

  it("rolls a failed check back and says so", async () => {
    const save = deferred<{ ok: false; message: string }>()
    actions.setTaskCompletion.mockReturnValue(save.promise)
    await renderApp()
    fireEvent.click(screen.getByRole("checkbox", { name: "Stretch" }))
    expect(screen.getByRole("checkbox", { name: "Stretch" }).getAttribute("aria-checked")).toBe("true")
    await act(async () => save.resolve({ ok: false, message: "The task could not be marked done." }))
    expect(screen.getByRole("checkbox", { name: "Stretch" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("The task could not be marked done.")).toBeTruthy()
  })

  it("shows a new meal at once and swaps in the saved row; a failure removes it", async () => {
    const save = deferred<unknown>()
    actions.saveFoodEntry.mockReturnValue(save.promise)
    await renderApp()
    const form = screen.getByRole("form", { name: "Add food" })
    fireEvent.change(within(form).getByLabelText("Food"), { target: { value: "Salmon bowl" } })
    fireEvent.change(within(form).getByLabelText("Calories"), { target: { value: "650" } })
    fireEvent.change(within(form).getByLabelText("Protein"), { target: { value: "42" } })
    fireEvent.submit(form)
    expect(screen.getByText("Salmon bowl")).toBeTruthy()
    // 1700 + 650 = 2350 kcal: past the 2000 kcal amount to reach while bulking.
    expect(document.querySelector('[data-metric="calories"]')?.getAttribute("data-tone")).toBe("good")
    await act(async () => save.resolve({ ok: true, data: { id: "f2", date: TODAY, description: "Salmon bowl", calories: 650, protein: 42, entryTime: null } }))
    expect(screen.getAllByText("Salmon bowl")).toHaveLength(1)

    const failed = deferred<unknown>()
    actions.saveFoodEntry.mockReturnValue(failed.promise)
    fireEvent.change(within(form).getByLabelText("Food"), { target: { value: "Toast" } })
    fireEvent.change(within(form).getByLabelText("Calories"), { target: { value: "200" } })
    fireEvent.change(within(form).getByLabelText("Protein"), { target: { value: "6" } })
    fireEvent.submit(form)
    expect(screen.getByText("Toast")).toBeTruthy()
    await act(async () => failed.resolve({ ok: false, message: "The food entry could not be saved." }))
    expect(screen.queryByText("Toast")).toBeNull()
    expect(screen.getByText("The food entry could not be saved.")).toBeTruthy()
  })

  it("changes day instantly with the arrows and keys, but not while typing", async () => {
    await renderApp()
    const selected = () => document.querySelector("[data-selected-date]")?.getAttribute("data-selected-date")
    fireEvent.click(screen.getByRole("button", { name: "Next day" }))
    expect(selected()).toBe("2026-11-13")
    expect(screen.queryByRole("checkbox", { name: "Read" })).toBeNull()
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(selected()).toBe("2026-11-11")
    fireEvent.keyDown(within(screen.getByRole("form", { name: "Add food" })).getByLabelText("Calories"), { key: "ArrowRight" })
    expect(selected()).toBe("2026-11-11")
    fireEvent.click(screen.getByRole("button", { name: "Today" }))
    expect(selected()).toBe(TODAY)
    fireEvent.change(screen.getByLabelText("Choose a date"), { target: { value: "2026-10-01" } })
    expect(selected()).toBe("2026-10-01")
    expect(actions.loadDailyRange).not.toHaveBeenCalled()
  })

  it("loads days outside the window and shows a skeleton only until they arrive", async () => {
    const load = deferred<unknown>()
    actions.loadDailyRange.mockReturnValue(load.promise)
    await renderApp()
    fireEvent.change(screen.getByLabelText("Choose a date"), { target: { value: "2025-03-03" } })
    expect(document.querySelector("[data-day-loading]")).not.toBeNull()
    await act(async () => load.resolve({ ok: true, data: { from: "2025-01-17", to: "2025-04-17", completions: ["11111111-1111-4111-8111-111111111111:2025-03-03"], food: [], water: [], sleep: [], steps: [], weight: [] } }))
    expect(document.querySelector("[data-day-loading]")).toBeNull()
    expect(screen.getByRole("checkbox", { name: "Stretch" }).getAttribute("aria-checked")).toBe("true")
  })

  it("hides a metric everywhere when it is turned off, and keeps its entries", async () => {
    actions.saveDailyPreferences.mockImplementation(async (next: DailyGoals) => ({ ok: true, data: next }))
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Daily Tasks preferences" }))
    const panel = screen.getByRole("dialog", { name: "Preferences" })
    fireEvent.click(within(panel).getByRole("switch", { name: "Calories & protein" }))
    expect(screen.queryByRole("form", { name: "Add food" })).toBeNull()
    expect(actions.saveDailyPreferences).toHaveBeenCalledWith(expect.objectContaining({ hiddenMetrics: ["food"] }))
    fireEvent.click(within(panel).getByRole("switch", { name: "Calories & protein" }))
    await act(async () => {})
    expect(screen.getByText("Oatmeal")).toBeTruthy()
  })

  it("switches calories to a limit in cutting mode", async () => {
    actions.saveDailyPreferences.mockImplementation(async (next: DailyGoals) => ({ ok: true, data: next }))
    await renderApp()
    // 1700 of 2000 kcal while bulking: below 90%.
    expect(document.querySelector('[data-metric="calories"]')?.getAttribute("data-tone")).toBe("below")
    fireEvent.click(screen.getByRole("button", { name: "Daily Tasks preferences" }))
    fireEvent.click(screen.getByRole("radio", { name: "Cutting" }))
    await act(async () => {})
    expect(document.querySelector('[data-metric="calories"]')?.getAttribute("data-tone")).toBe("good")
    expect(within(document.querySelector('[data-metric="calories"]') as HTMLElement).getByText("Under")).toBeTruthy()
  })

  it("closes preferences on Escape and outside clicks, returning focus to the gear", async () => {
    await renderApp()
    const gear = screen.getByRole("button", { name: "Daily Tasks preferences" })
    fireEvent.click(gear)
    expect(gear.getAttribute("aria-expanded")).toBe("true")
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(gear)
    fireEvent.click(gear)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not change day with the arrow keys while the preferences panel is open", async () => {
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Daily Tasks preferences" }))
    fireEvent.keyDown(screen.getByRole("radio", { name: "Bulking" }), { key: "ArrowRight" })
    expect(document.querySelector("[data-selected-date]")?.getAttribute("data-selected-date")).toBe(TODAY)
  })

  it("deletes an entry at once and offers to undo it", async () => {
    actions.deleteHealthEntry.mockResolvedValue({ ok: true, data: null })
    actions.saveFoodEntry.mockImplementation(async (input: { description: string; calories: number; protein: number }) => ({ ok: true, data: { id: "f9", date: TODAY, description: input.description, calories: input.calories, protein: input.protein, entryTime: "08:00" } }))
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Delete Oatmeal" }))
    expect(screen.queryByText("Oatmeal")).toBeNull()
    await act(async () => {})
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }))
    await act(async () => {})
    expect(screen.getByText("Oatmeal")).toBeTruthy()
    expect(actions.saveFoodEntry).toHaveBeenCalledWith(expect.objectContaining({ description: "Oatmeal", calories: 1700 }))
  })
})
