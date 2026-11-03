import { beforeEach, describe, expect, it, vi } from "vitest"

import { abandonedUploadPaths } from "@/lib/resume/files"

const USER = "11111111-1111-4111-8111-111111111111"
const NOW = new Date("2026-11-02T12:00:00Z")
const OLD = "2026-10-31T12:00:00Z"
const NEW = "2026-11-02T11:00:00Z"
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

describe("abandoned uploads", () => {
  it("picks only unregistered, day-old objects that match the owner path", () => {
    const objects = [
      { name: `${A}.pdf`, created_at: OLD },
      { name: `${B}.docx`, created_at: OLD },
      { name: `${C}.pdf`, created_at: NEW },
      { name: "notes.txt", created_at: OLD },
      { name: `${A}.exe`, created_at: OLD },
      { name: `${C}.docx`, created_at: null },
    ]
    const registered = new Set([`${USER}/${B}.docx`])
    expect(abandonedUploadPaths(USER, objects, registered, NOW)).toEqual([`${USER}/${A}.pdf`])
  })
})

const storage = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }))
const rows = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: USER, email: null })) }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    storage: { from: () => storage },
    from: () => ({ select: () => ({ eq: rows }) }),
  })),
}))

beforeEach(() => {
  storage.list.mockReset()
  storage.remove.mockReset()
  rows.mockReset()
})

describe("cleanupAbandonedUploads", () => {
  it("lists the user's own prefix and removes only abandoned objects, with the user's session", async () => {
    const { cleanupAbandonedUploads } = await import("@/lib/resume/data")
    storage.list.mockResolvedValue({ data: [{ name: `${A}.pdf`, created_at: OLD }, { name: `${B}.pdf`, created_at: OLD }], error: null })
    rows.mockResolvedValue({ data: [{ storage_path: `${USER}/${B}.pdf` }], error: null })
    storage.remove.mockResolvedValue({ error: null })
    expect(await cleanupAbandonedUploads(NOW)).toBe(1)
    expect(storage.list).toHaveBeenCalledWith(USER, { limit: 1000 })
    expect(storage.remove).toHaveBeenCalledWith([`${USER}/${A}.pdf`])
  })

  it("removes nothing when the resume rows cannot be read", async () => {
    const { cleanupAbandonedUploads } = await import("@/lib/resume/data")
    storage.list.mockResolvedValue({ data: [{ name: `${A}.pdf`, created_at: OLD }], error: null })
    rows.mockResolvedValue({ data: null, error: { code: "x" } })
    expect(await cleanupAbandonedUploads(NOW)).toBe(0)
    expect(storage.remove).not.toHaveBeenCalled()
  })
})
