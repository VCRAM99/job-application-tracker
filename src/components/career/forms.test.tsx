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
        encryptionReady
        managedReady={false}
      />,
    )
    expect(screen.getByText(/Unverified/)).toBeTruthy()
    expect(screen.queryByText(/Connected/)).toBeNull()
    expect(screen.getByText(/not configured/)).toBeTruthy()
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
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy()
  })
})
