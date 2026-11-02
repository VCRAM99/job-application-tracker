import { describe, expect, it } from "vitest"

import { FOLLOW_UP_RULES, followUpSuggestions, SUGGESTION_KEY, type FollowUpApplication } from "@/lib/coach/follow-ups"

const APP = "6f1c2a4e-1111-4aaa-8bbb-000000000001"
const CONTACT = "6f1c2a4e-2222-4aaa-8bbb-000000000002"

function app(overrides: Partial<FollowUpApplication>): FollowUpApplication {
  return { id: APP, jobTitle: "Engineer", companyName: "Northwind", status: "applied", appliedAt: null, statusChangedAt: null, updatedAt: "2026-10-01T00:00:00Z", ...overrides }
}

const run = (applications: FollowUpApplication[], now: string, timeZone = "UTC", contacts: Array<{ nextFollowUpDate: string | null }> = []) =>
  followUpSuggestions({
    applications,
    contacts: contacts.map((contact) => ({ id: CONTACT, name: "Dana", applicationId: null, ...contact })),
    now: new Date(now),
    timeZone,
  })

describe("applied for a week with no status change", () => {
  it("fires on day 7 and not on day 6", () => {
    expect(run([app({ appliedAt: "2026-10-25" })], "2026-10-31T23:59:00Z")).toEqual([])
    const due = run([app({ appliedAt: "2026-10-25" })], "2026-11-01T00:00:00Z")
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ rule: "applied_stale", dueDate: "2026-11-01", overdue: false, draftKind: "follow_up" })
    expect(run([app({ appliedAt: "2026-10-20" })], "2026-11-01T12:00:00Z")[0]!.overdue).toBe(true)
  })

  it("uses the later of the applied date and the last status change", () => {
    const changed = app({ appliedAt: "2026-10-01", statusChangedAt: "2026-10-28T10:00:00Z" })
    expect(run([changed], "2026-11-03T12:00:00Z")).toEqual([])
    expect(run([changed], "2026-11-04T12:00:00Z")[0]!.key).toBe(`applied_stale:${APP}:2026-10-28`)
  })

  it("counts days in the user's timezone", () => {
    // 2026-10-25T06:30Z is still Oct 24 in Los Angeles and already Oct 25 in Tokyo.
    const changed = app({ statusChangedAt: "2026-10-25T06:30:00Z" })
    // At 10:00Z on Oct 31 it is Oct 31 in both, so seven local days have passed only in Los Angeles.
    expect(run([changed], "2026-10-31T10:00:00Z", "America/Los_Angeles")).toHaveLength(1)
    expect(run([changed], "2026-10-31T10:00:00Z", "Asia/Tokyo")).toEqual([])
  })

  it("ignores other statuses and rows with no dates", () => {
    expect(run([app({ status: "saved", appliedAt: "2026-01-01" })], "2026-11-01T00:00:00Z")).toEqual([])
    expect(run([app({ appliedAt: null, statusChangedAt: null })], "2026-11-01T00:00:00Z")).toEqual([])
  })
})

describe("thank-you after an interview stage", () => {
  const entered = "2026-11-01T15:00:00Z"
  const interview = app({ status: "technical_interview", statusChangedAt: entered })

  it("is due within 24 hours and stays visible for 72", () => {
    expect(run([interview], "2026-11-01T14:59:00Z")).toEqual([])
    expect(run([interview], "2026-11-02T15:00:00Z")[0]).toMatchObject({ rule: "thank_you", overdue: false, draftKind: "thank_you" })
    expect(run([interview], "2026-11-02T15:01:00Z")[0]!.overdue).toBe(true)
    expect(run([interview], "2026-11-04T15:00:00Z")).toHaveLength(1)
    expect(run([interview], "2026-11-04T15:01:00Z")).toEqual([])
    expect(FOLLOW_UP_RULES).toMatchObject({ thankYouDueHours: 24, thankYouShowHours: 72 })
  })

  it("keys by stage so a later stage suggests again", () => {
    const first = run([interview], "2026-11-01T16:00:00Z")[0]!.key
    const later = run([app({ status: "final_interview", statusChangedAt: "2026-11-05T09:00:00Z" })], "2026-11-05T10:00:00Z")[0]!.key
    expect(first).not.toBe(later)
    expect(SUGGESTION_KEY.test(first)).toBe(true)
    expect(SUGGESTION_KEY.test(later)).toBe(true)
  })
})

describe("contact follow-up date", () => {
  it("fires on the date and after, not before, in local time", () => {
    // 03:00Z on Nov 1 is still Oct 31 in New York.
    expect(run([], "2026-11-01T03:00:00Z", "America/New_York", [{ nextFollowUpDate: "2026-11-01" }])).toEqual([])
    const today = run([], "2026-11-01T03:00:00Z", "UTC", [{ nextFollowUpDate: "2026-11-01" }])
    expect(today[0]).toMatchObject({ rule: "contact_follow_up", overdue: false, contactId: CONTACT })
    expect(run([], "2026-11-03T06:00:00Z", "UTC", [{ nextFollowUpDate: "2026-11-01" }])[0]!.overdue).toBe(true)
    expect(run([], "2026-11-03T06:00:00Z", "UTC", [{ nextFollowUpDate: null }])).toEqual([])
  })
})

describe("suggestion state", () => {
  it("hides dismissed suggestions and ones with an open task", () => {
    const base = { applications: [app({ appliedAt: "2026-10-01" })], contacts: [], now: new Date("2026-11-01T00:00:00Z"), timeZone: "UTC" }
    const key = followUpSuggestions(base)[0]!.key
    expect(followUpSuggestions({ ...base, states: new Map([[key, { dismissed: true, openTask: false }]]) })).toEqual([])
    expect(followUpSuggestions({ ...base, states: new Map([[key, { dismissed: false, openTask: true }]]) })).toEqual([])
    expect(followUpSuggestions({ ...base, states: new Map([[key, { dismissed: false, openTask: false }]]) })).toHaveLength(1)
  })
})
