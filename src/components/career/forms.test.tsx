import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AiSettingsForm, SuggestionCard } from "@/components/career/forms"
import { initialRecordFormState } from "@/lib/records/form-state"

describe("career AI forms", () => {
  it("does not call a saved key connected", () => {
    render(
      <AiSettingsForm
        action={vi.fn().mockResolvedValue(initialRecordFormState)}
        credentialAction={vi.fn().mockResolvedValue(initialRecordFormState)}
        revoke={vi.fn()}
        settings={{ executionMode: "byok", provider: "openai", model: "gpt-5.4-mini" }}
        credentials={[{ id: "cred-1", provider: "openai", lastFour: "1234", status: "unverified" }]}
        usage={{ requests: 0, tokens: 0, policyEnabled: false, requestLimit: 0, tokenLimit: 0 }}
        encryptionError={null}
        managedReady={false}
      />,
    )
    expect(screen.getByText(/Unverified/)).toBeTruthy()
    expect(screen.queryByText(/Connected/)).toBeNull()
    expect(screen.getByText(/not configured/)).toBeTruthy()
  })

  it("names the missing server key and disables only key saving", () => {
    render(
      <AiSettingsForm
        action={vi.fn().mockResolvedValue(initialRecordFormState)}
        credentialAction={vi.fn().mockResolvedValue(initialRecordFormState)}
        revoke={vi.fn()}
        settings={{ executionMode: "byok", provider: "google", model: "gemini-3.8-flash" }}
        credentials={[]}
        usage={{ requests: 0, tokens: 0, policyEnabled: false, requestLimit: 0, tokenLimit: 0 }}
        encryptionError="AI_CREDENTIALS_KEY must be 32 bytes, encoded as base64 or hex."
        managedReady={false}
      />,
    )
    expect(screen.getByRole("alert").textContent).toMatch(/AI_CREDENTIALS_KEY must be 32 bytes/)
    expect((screen.getByRole("button", { name: "Save key" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Save AI settings" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("reviews one suggestion at a time", () => {
    render(
      <SuggestionCard
        suggestion={{
          id: "suggestion-1",
          sourceId: "source-1",
          factType: "skill",
          status: "pending",
          payload: { name: "TypeScript", category: null, evidence: "Skills: TypeScript" },
          evidence: "Skills: TypeScript",
        }}
        accept={vi.fn().mockResolvedValue(initialRecordFormState)}
        reject={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue("TypeScript")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy()
    const reject = screen.getByRole("button", { name: "Reject" })
    expect(reject.getAttribute("name")).toBeNull()
    expect(document.querySelector("input[name='suggestionId']")).toBeTruthy()
  })
})
