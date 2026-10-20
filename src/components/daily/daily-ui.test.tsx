import { readFileSync } from "node:fs"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Disclosure } from "@/components/daily/disclosure"
import { SubmitButton } from "@/components/daily/controls"
import { HealthPanel } from "@/components/daily/health-panel"
import { TargetsForm } from "@/components/daily/targets-form"
import { WaterCard } from "@/components/daily/water-card"

const goals = {
  calorieTarget: 2000,
  proteinTarget: 180,
  waterGoalMl: 3500,
  waterIncrementMl: 250,
  sleepTargetMinutes: 480,
  stepTarget: 10000,
  weightUnit: "kg" as const,
}

describe("daily collapsible sections", () => {
  it("keeps task management and weekly insights collapsed", () => {
    render(
      <div>
        <Disclosure title="Manage recurring tasks" summary="2 tasks">Tasks</Disclosure>
        <Disclosure title="Weekly Insights" summary="2026-10-12 – 2026-10-18 · 3/6">Insights</Disclosure>
      </div>,
    )
    expect(screen.getByRole("button", { name: /Manage recurring tasks/ }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("button", { name: /Weekly Insights/ }).getAttribute("aria-expanded")).toBe("false")
    expect(document.querySelector(".disclosure-panel")?.getAttribute("data-open")).toBe("false")
    expect(document.querySelector(".disclosure-panel")?.hasAttribute("inert")).toBe(true)
  })

  it("expands health tracking unless the saved preference closes it", () => {
    render(
      <HealthPanel date="2026-10-19" today="2026-10-19" defaultOpen goals={goals} food={[]} water={[]} sleep={[]} steps={[]} weight={[]} chart={{ calories: [], protein: [], water: [], sleep: [], steps: [], weight: [] }} />,
    )
    expect(screen.getByRole("button", { name: /Health Tracking/ }).getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: /Health Insights/ }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("button", { name: /Targets & Preferences/ }).getAttribute("aria-expanded")).toBe("false")
  })

  it("starts health tracking collapsed when that preference is saved", () => {
    render(
      <HealthPanel date="2026-10-19" today="2026-10-19" defaultOpen={false} goals={goals} food={[]} water={[]} sleep={[]} steps={[]} weight={[]} chart={{ calories: [], protein: [], water: [], sleep: [], steps: [], weight: [] }} />,
    )
    expect(screen.getByRole("button", { name: /Health Tracking/ }).getAttribute("aria-expanded")).toBe("false")
  })

  it("shows saved targets and does not submit them on render", () => {
    const { container } = render(<TargetsForm goals={goals} />)
    expect((container.querySelector("[name=calorieTarget]") as HTMLInputElement).value).toBe("2000")
    expect((container.querySelector("[name=weightUnit]") as HTMLSelectElement).value).toBe("kg")
    expect((screen.getByRole("button", { name: "Save targets" }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("water controls", () => {
  it("updates the total immediately and rolls back a failed save", async () => {
    let rejectSave: ((value: { ok: false; message: string }) => void) | undefined
    const add = vi.fn(
      () =>
        new Promise<{ ok: false; message: string }>((resolve) => {
          rejectSave = resolve
        }),
    )
    render(<WaterCard date="2026-10-19" serverTotal={0} increment={250} goal={1000} add={add} />)
    const addButton = screen.getByRole("button", { name: "+ 250 mL" })
    await act(async () => {
      fireEvent.click(addButton)
      fireEvent.click(addButton)
      fireEvent.click(addButton)
    })
    expect(screen.getByText("750")).toBeTruthy()
    expect(add).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectSave?.({ ok: false, message: "Water could not be saved." })
    })
    expect(screen.getByRole("alert").textContent).toContain("Water could not be saved.")
    expect(screen.getByText("500")).toBeTruthy()
  })

  it("does not let a later server total double-count optimistic water", () => {
    const { rerender } = render(<WaterCard date="2026-10-19" serverTotal={0} increment={250} goal={null} add={vi.fn(async () => ({ ok: true as const, message: "Water saved." }))} />)
    fireEvent.click(screen.getByRole("button", { name: "+ 250 mL" }))
    expect(screen.getByText("250")).toBeTruthy()
    rerender(<WaterCard date="2026-10-19" serverTotal={250} increment={250} goal={null} add={vi.fn(async () => ({ ok: true as const, message: "Water saved." }))} />)
    expect(screen.getByText("250")).toBeTruthy()
    expect(screen.queryByText("500")).toBeNull()
  })

  it("disables undo when the total is already zero", () => {
    render(<WaterCard date="2026-10-19" serverTotal={0} increment={250} goal={null} add={vi.fn()} />)
    expect((screen.getByRole("button", { name: "Undo 250 mL" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("interaction styles", () => {
  it("disables a submit button while its form is saving", async () => {
    render(
      <form
        action={() =>
          new Promise(() => {
            /* stays pending */
          })
        }
      >
        <SubmitButton>Save targets</SubmitButton>
      </form>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Save targets" }))
    expect((await screen.findByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("turns motion off when the user prefers reduced motion", () => {
    const css = readFileSync("src/app/globals.css", "utf8")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).toContain(".pressable:active { transform: none; }")
    expect(css).toContain(".disclosure-panel,\n  .disclosure-chevron { transition: none; }")
  })
})
