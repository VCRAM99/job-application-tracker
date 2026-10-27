import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/analyze/actions", () => ({ startAnalysis: vi.fn(), rerunAnalysis: vi.fn(), claimRequirement: vi.fn() }))

import { AnalyzeForm } from "@/components/analyze/forms"

const defaults = { title: "", company: "", jdText: "", postingId: "", applicationId: "" }

describe("analyze form", () => {
  it.each([
    ["no saved settings", null, "Save a provider and an execution mode in Settings before running a qualification match."],
    ["a missing key", { executionMode: "byok" as const, provider: "google" }, "Save a key for the selected provider in Settings before running AI."],
  ])("keeps the job description editable with %s and disables only Analyze", async (_label, settings, reason) => {
    render(<AnalyzeForm settings={settings} sources={[]} defaults={defaults} mockProvider={false} blockedReason={reason} />)
    const box = screen.getByRole("textbox", { name: /job description/i }) as HTMLTextAreaElement
    expect(box.disabled).toBe(false)
    await userEvent.click(box)
    await userEvent.paste("Required: TypeScript")
    expect(box.value).toBe("Required: TypeScript")
    expect(screen.getByRole("alert").textContent).toBe(reason)
    const button = screen.getByRole("button", { name: "Analyze fit" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-describedby")).toBe("analyze-blocked")
  })

  it("enables Analyze when nothing blocks the run", () => {
    render(
      <AnalyzeForm
        settings={{ executionMode: "byok", provider: "google" }}
        sources={[]}
        defaults={defaults}
        mockProvider={false}
        blockedReason={null}
      />,
    )
    expect(screen.queryByRole("alert")).toBeNull()
    expect((screen.getByRole("button", { name: "Analyze fit" }) as HTMLButtonElement).disabled).toBe(false)
  })
})
