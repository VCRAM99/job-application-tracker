import { readFileSync } from "node:fs"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Disclosure } from "@/components/daily/disclosure"
import { SubmitButton } from "@/components/daily/controls"


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
