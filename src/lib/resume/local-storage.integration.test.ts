// @vitest-environment node

import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

const url = process.env.LOCAL_SUPABASE_URL ?? ""
const anon = process.env.LOCAL_SUPABASE_ANON_KEY ?? ""
const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? ""
const enabled = url === "http://127.0.0.1:54321" && anon.length > 20 && service.length > 20
const PDF = new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/resume/fixtures/avery.pdf")))

type Session = { id: string; token: string }

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

function upload(token: string | null, name: string, body: Uint8Array, type = "application/pdf", upsert = false) {
  return fetch(`${url}/storage/v1/object/resumes/${name}`, {
    method: "POST",
    headers: {
      apikey: anon,
      authorization: `Bearer ${token ?? anon}`,
      "content-type": type,
      "x-upsert": upsert ? "true" : "false",
    },
    body: Buffer.from(body),
  })
}

function download(token: string | null, name: string) {
  return fetch(`${url}/storage/v1/object/authenticated/resumes/${name}`, {
    headers: { apikey: anon, authorization: `Bearer ${token ?? anon}` },
  })
}

describe.skipIf(!enabled)("local resume storage policies", () => {
  const password = `Local-${randomUUID()}`
  let ada: Session
  let grace: Session
  const created: string[] = []

  beforeAll(async () => {
    ada = await createUser(`m4-a-${randomUUID()}@example.com`, password)
    grace = await createUser(`m4-b-${randomUUID()}@example.com`, password)
  }, 30000)

  afterAll(async () => {
    if (created.length > 0) {
      await fetch(`${url}/storage/v1/object/resumes`, {
        method: "DELETE",
        headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: created }),
      })
    }
    for (const user of [ada, grace]) {
      if (!user) continue
      await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: { apikey: service, authorization: `Bearer ${service}` } })
    }
  })

  it("lets the owner upload and read only under their own prefix", async () => {
    const own = `${ada.id}/${randomUUID()}.pdf`
    const stored = await upload(ada.token, own, PDF)
    expect(stored.status).toBe(200)
    created.push(own)
    expect((await download(ada.token, own)).status).toBe(200)

    expect([400, 403, 404]).toContain((await download(grace.token, own)).status)
    expect([400, 401, 403, 404]).toContain((await download(null, own)).status)
    const intoAda = `${ada.id}/${randomUUID()}.pdf`
    expect([400, 403]).toContain((await upload(grace.token, intoAda, PDF)).status)
    expect([400, 401, 403]).toContain((await upload(null, `${ada.id}/${randomUUID()}.pdf`, PDF)).status)
    for (const name of [`${ada.id}/sub/${randomUUID()}.pdf`, `${ada.id}/${randomUUID()}.html`, `${ada.id}/notes.pdf`]) {
      expect([400, 403]).toContain((await upload(ada.token, name, PDF)).status)
    }
  })

  it("enforces the bucket's MIME list, size limit, and no-overwrite rule", async () => {
    expect([400, 415]).toContain((await upload(ada.token, `${ada.id}/${randomUUID()}.pdf`, PDF, "text/html")).status)
    const big = new Uint8Array(5 * 1024 * 1024 + 1024).fill(0x20)
    expect([400, 413]).toContain((await upload(ada.token, `${ada.id}/${randomUUID()}.pdf`, big)).status)

    const name = `${ada.id}/${randomUUID()}.pdf`
    expect((await upload(ada.token, name, PDF)).status).toBe(200)
    created.push(name)
    expect([400, 403, 409]).toContain((await upload(ada.token, name, PDF, "application/pdf", true)).status)
  })
})
