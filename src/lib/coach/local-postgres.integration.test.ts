// @vitest-environment node

import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

const url = process.env.LOCAL_SUPABASE_URL ?? ""
const anon = process.env.LOCAL_SUPABASE_ANON_KEY ?? ""
const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? ""
const enabled = url === "http://127.0.0.1:54321" && anon.length > 20 && service.length > 20

type Session = { id: string; token: string }
const META = { prompt_version: "p", schema_version: "s", provider: "google", model: "gemini-3.8-flash", execution_mode: "byok" }

async function createUser(email: string, password: string): Promise<Session> {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const user = (await created.json()) as { id?: string }
  if (!created.ok || !user.id) throw new Error(`local auth admin failed (${created.status})`)
  const signed = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const session = (await signed.json()) as { access_token?: string }
  if (!signed.ok || !session.access_token) throw new Error(`local sign-in failed (${signed.status})`)
  return { id: user.id, token: session.access_token }
}

function rest(token: string | null, path: string, init: { method?: string; body?: unknown } = {}) {
  return fetch(`${url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: anon,
      authorization: `Bearer ${token ?? anon}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

async function insert(token: string, table: string, row: Record<string, unknown>): Promise<string> {
  const response = await rest(token, table, { method: "POST", body: row })
  const body = (await response.json()) as Array<{ id: string }>
  if (!response.ok) throw new Error(`${table} insert failed: ${JSON.stringify(body)}`)
  return body[0]!.id
}

describe.skipIf(!enabled)("career coach on local Supabase", () => {
  const password = `Local-${randomUUID()}`
  let ada: Session
  let grace: Session

  async function world(user: Session) {
    const company = await insert(user.token, "companies", { name: "Fictional Co" })
    const application = await insert(user.token, "applications", { company_id: company, job_title: "Engineer", status: "applied" })
    const contact = await insert(user.token, "contacts", { name: "Dana Reyes", email: "dana@example.com", application_id: application })
    const brief = await insert(user.token, "research_briefs", { company_id: company, application_id: application, label: "Brief", sources: [{ id: "S1" }], ...META })
    const set = await insert(user.token, "interview_question_sets", { application_id: application, label: "Set", ...META })
    const draft = await insert(user.token, "coach_drafts", {
      kind: "outreach_recruiter", format: "email", contact_id: contact, application_id: application, brief_id: brief, body: "Hi Dana, thanks.", ...META,
    })
    return { company, application, contact, brief, set, draft }
  }

  beforeAll(async () => {
    ada = await createUser(`m5-a-${randomUUID()}@example.com`, password)
    grace = await createUser(`m5-b-${randomUUID()}@example.com`, password)
  }, 30000)

  afterAll(async () => {
    for (const user of [ada, grace]) {
      if (!user) continue
      await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: { apikey: service, authorization: `Bearer ${service}` } })
    }
  })

  it("isolates every coach table and rejects cross-user links", async () => {
    const theirs = await world(ada)
    for (const table of ["research_briefs", "interview_question_sets", "coach_drafts", "practice_answers", "story_bank_entries", "follow_up_suggestion_states"]) {
      const seen = await rest(grace.token, `${table}?select=id`)
      expect(await seen.json()).toEqual([])
      const anonymous = await rest(null, `${table}?select=id`)
      expect(anonymous.ok).toBe(false)
    }
    const attempt = await rest(grace.token, "coach_drafts", {
      method: "POST",
      body: { kind: "follow_up", format: "message", contact_id: theirs.contact, body: "x", ...META },
    })
    expect(attempt.ok).toBe(false)
    const foreignSet = await rest(grace.token, "practice_answers", {
      method: "POST",
      body: { set_id: theirs.set, question_id: "q-0", answer: "a", ...META },
    })
    expect(foreignSet.ok).toBe(false)
  })

  it("marks only the caller's draft sent and updates only the caller's contact", async () => {
    const theirs = await world(ada)
    const today = new Date().toISOString().slice(0, 10)
    const stolen = await rest(grace.token, "rpc/mark_coach_draft_sent", { method: "POST", body: { p_draft_id: theirs.draft, p_local_date: today } })
    expect(stolen.ok).toBe(false)
    const anonymous = await rest(null, "rpc/mark_coach_draft_sent", { method: "POST", body: { p_draft_id: theirs.draft, p_local_date: today } })
    expect(anonymous.ok).toBe(false)
    const untouched = await rest(ada.token, `contacts?id=eq.${theirs.contact}&select=outreach_status,last_contacted_at`)
    expect(await untouched.json()).toEqual([{ outreach_status: "not_contacted", last_contacted_at: null }])

    const marked = await rest(ada.token, "rpc/mark_coach_draft_sent", { method: "POST", body: { p_draft_id: theirs.draft, p_local_date: today } })
    expect(marked.ok).toBe(true)
    expect(await marked.json()).toMatchObject({ contact_updated: true, already_sent: false })
    const contact = (await (await rest(ada.token, `contacts?id=eq.${theirs.contact}&select=outreach_status,last_contacted_at`)).json()) as Array<Record<string, unknown>>
    expect(contact[0]).toMatchObject({ outreach_status: "contacted", last_contacted_at: today })
  })

  it("deletes linked applications, contacts, companies, and briefs without failing", async () => {
    const mine = await world(ada)
    for (const [table, id] of [["contacts", mine.contact], ["research_briefs", mine.brief], ["applications", mine.application], ["companies", mine.company]] as const) {
      const removed = await rest(ada.token, `${table}?id=eq.${id}`, { method: "DELETE" })
      expect(removed.ok).toBe(true)
    }
    const draft = await rest(ada.token, `coach_drafts?id=eq.${mine.draft}&select=contact_id,application_id,brief_id`)
    expect(await draft.json()).toEqual([{ contact_id: null, application_id: null, brief_id: null }])
  })

  it("creates one task per suggestion key", async () => {
    const mine = await world(ada)
    const key = `applied_stale:${mine.application}:2026-10-20`
    const body = { p_key: key, p_title: "Follow up", p_description: "d", p_due: null, p_application_id: mine.application }
    const first = (await (await rest(ada.token, "rpc/create_follow_up_task", { method: "POST", body })).json()) as { task_id: string; created: boolean }
    const second = (await (await rest(ada.token, "rpc/create_follow_up_task", { method: "POST", body })).json()) as { task_id: string; created: boolean }
    expect(first.created).toBe(true)
    expect(second).toEqual({ task_id: first.task_id, created: false })
  })
})
