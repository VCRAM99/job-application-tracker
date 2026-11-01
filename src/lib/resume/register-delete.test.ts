import { readFileSync } from "node:fs"
import path from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

const USER = "11111111-1111-4111-8111-111111111111"
const PATH = `${USER}/22222222-2222-4222-8222-222222222222.pdf`

const state = vi.hoisted(() => ({
  calls: [] as string[],
  removed: [] as string[][],
  insertError: null as null | { code: string; message: string },
  existing: null as null | { id: string; storage_path: string },
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: USER, email: null })) }))
vi.mock("@/lib/resume/flags", () => ({ resumeStudioEnabled: () => true }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const bytes = new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/resume/fixtures/avery.pdf")))
    const table = (name: string) => {
      const filters: string[] = []
      let op = "select"
      const builder = {
        select: () => builder,
        insert: () => ((op = "insert"), builder),
        delete: () => ((op = "delete"), builder),
        eq: (column: string, value: string) => (filters.push(`${column}=${value}`), builder),
        is: (column: string, value: null) => (filters.push(`${column} is ${value}`), builder),
        or: (value: string) => (filters.push(`or(${value})`), builder),
        limit: () => builder,
        single: async () => (state.calls.push(`${op} ${name}`), { data: state.insertError ? null : { id: "new-id" }, error: state.insertError }),
        maybeSingle: async () => {
          state.calls.push(`${op} ${name} ${filters.join(" ")}`)
          if (name === "resumes" && op === "select" && filters.some((f) => f.startsWith("id="))) return { data: { storage_path: PATH }, error: null }
          return { data: state.existing, error: null }
        },
        then: (resolve: (value: unknown) => void) => {
          state.calls.push(`${op} ${name} ${filters.join(" ")}`)
          resolve({ data: null, error: null })
        },
      }
      return builder
    }
    return {
      from: table,
      storage: {
        from: () => ({
          download: async () => ({ data: new Blob([bytes]), error: null }),
          remove: async (paths: string[]) => (state.removed.push(paths), { data: null, error: null }),
        }),
      },
    }
  }),
}))

import { deleteResume, registerResume } from "@/lib/resume/actions"

describe("registering an upload twice", () => {
  beforeEach(() => {
    state.calls.length = 0
    state.removed.length = 0
    state.insertError = null
    state.existing = null
  })

  it("keeps the object when the conflicting row is the same path", async () => {
    state.insertError = { code: "23505", message: "duplicate" }
    state.existing = { id: "first-id", storage_path: PATH }
    await expect(registerResume({ path: PATH, label: "a.pdf" })).resolves.toEqual({ ok: true, id: "first-id", existing: true })
    expect(state.removed).toEqual([])
  })

  it("removes the new object when the same file is already stored elsewhere", async () => {
    state.insertError = { code: "23505", message: "duplicate" }
    state.existing = { id: "first-id", storage_path: `${USER}/33333333-3333-4333-8333-333333333333.pdf` }
    await expect(registerResume({ path: PATH, label: "a.pdf" })).resolves.toMatchObject({ ok: true, id: "first-id" })
    expect(state.removed).toEqual([[PATH]])
  })

  it("refuses another user's path before touching Storage", async () => {
    await expect(registerResume({ path: PATH.replace(USER, "44444444-4444-4444-8444-444444444444"), label: "x" })).resolves.toMatchObject({ ok: false })
    expect(state.calls).toEqual([])
  })
})

describe("deleting a resume", () => {
  it("deletes only its unlinked versions, then the row, then the file", async () => {
    state.calls.length = 0
    state.removed.length = 0
    const form = new FormData()
    form.set("resumeId", "22222222-2222-4222-8222-222222222222")
    await expect(deleteResume(form)).resolves.toMatchObject({ status: "idle" })
    const deletes = state.calls.filter((call) => call.startsWith("delete"))
    expect(deletes[0]).toContain("resume_versions")
    expect(deletes[0]).toContain("application_id is null")
    expect(deletes[1]).toContain("delete resumes")
    expect(state.removed).toEqual([[PATH]])
  })
})
