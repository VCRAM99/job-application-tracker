import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "u", email: null })) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/records/data", () => ({
  listApplications: vi.fn(async () => ({
    ok: true,
    data: [
      { id: "a1", jobTitle: "Platform Engineer", companyName: "Kestrel Pay" },
      { id: "a2", jobTitle: "Data Engineer", companyName: "" },
    ],
  })),
}))

import { listApplicationOptions } from "@/lib/resume/data"

describe("application link options", () => {
  // Regression: an embedded companies(name) select was ambiguous (two foreign keys) and returned nothing.
  it("lists the user's applications with company names from listApplications", async () => {
    await expect(listApplicationOptions()).resolves.toEqual([
      { id: "a1", label: "Platform Engineer · Kestrel Pay" },
      { id: "a2", label: "Data Engineer" },
    ])
  })
})
