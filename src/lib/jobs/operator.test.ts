import { describe, expect, it, vi } from "vitest"

import { approvePayload, parseArgs, parseEnvFile, registerPayload, resolveTarget } from "@/lib/jobs/operator"

const LOCAL = "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local\n"
const REF = "abcdefghijklmnopqrst"
const HOSTED = `NEXT_PUBLIC_SUPABASE_URL=https://${REF}.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_prod\n`

function target(flag: string | true | undefined, files: Record<string, string>, answer = "", shellEnv = {}) {
  const ask = vi.fn(async () => answer)
  const lines: string[] = []
  const result = resolveTarget({
    flag,
    action: "register source greenhouse:acme as a draft",
    readFile: (name) => files[name] ?? null,
    shellEnv,
    ask,
    print: (line) => lines.push(line),
  })
  return { result, ask, lines }
}

const activation = ["--usage", "Store public fields", "--attribution", "Name Greenhouse", "--retention", "Expire omitted", "--fields", "title,urls"]

describe("operator CLI target guard", () => {
  it("defaults to local and refuses a local file that points anywhere else", async () => {
    const local = target(undefined, { ".env.development.local": LOCAL, ".env.local": HOSTED })
    await expect(local.result).resolves.toMatchObject({ ok: true, target: "local", host: "127.0.0.1:54321" })
    expect(local.ask).not.toHaveBeenCalled()

    const misconfigured = target(undefined, { ".env.development.local": HOSTED })
    await expect(misconfigured.result).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/--target production/) })
  })

  it("never reads .env.local without --target production", async () => {
    const readFile = vi.fn((name: string) => (name === ".env.development.local" ? LOCAL : HOSTED))
    await resolveTarget({ flag: undefined, action: "x", readFile, shellEnv: {}, ask: vi.fn(), print: vi.fn() })
    expect(readFile.mock.calls.map(([name]) => name)).toEqual([".env.development.local"])
  })

  it("requires the typed project ref for production and prints no secret", async () => {
    const files = { ".env.local": `${HOSTED}JOB_CATALOG_WRITE_SECRET=${"s".repeat(40)}\n` }
    const wrong = target("production", files, "nope")
    await expect(wrong.result).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/did not match/) })
    expect(wrong.lines).toEqual([`Target: PRODUCTION ${REF}.supabase.co`, "Action: register source greenhouse:acme as a draft"])

    const right = target("production", files, `${REF}\n`)
    await expect(right.result).resolves.toMatchObject({ ok: true, target: "production" })
    expect(right.lines.join("\n")).not.toContain("s".repeat(40))
    expect(right.lines.join("\n")).not.toContain("sb_publishable_prod")
  })

  it("refuses exported Supabase or catalog values in the shell and an unknown target", async () => {
    const exported = target(undefined, { ".env.development.local": LOCAL }, "", {
      NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    })
    await expect(exported.result).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Unset NEXT_PUBLIC_SUPABASE_URL/) })
    await expect(target("staging", {}).result).resolves.toMatchObject({ ok: false })
    await expect(target(true, {}).result).resolves.toMatchObject({ ok: false })
  })

  it("rejects a production file that is not a hosted Supabase URL", async () => {
    const result = target("production", { ".env.local": LOCAL }, REF)
    await expect(result.result).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/hosted Supabase/) })
    expect(result.ask).not.toHaveBeenCalled()
  })
})

describe("operator CLI payloads", () => {
  it("parses flags and env files", () => {
    expect(parseArgs(["preview", "greenhouse", "acme", "--region", "eu", "--live", "--x=1"])).toEqual({
      command: "preview",
      positional: ["greenhouse", "acme"],
      flags: { region: "eu", live: true, x: "1" },
    })
    expect(parseEnvFile('# c\nexport A="1"\nB=two=2\n\nbad line\n')).toEqual({ A: "1", B: "two=2" })
  })

  it("registers a draft with a derived slug and requires the activation record", () => {
    const flags = parseArgs(["register", "--provider", "greenhouse", "--identifier", "Acme", "--employer-name", "Acme", "--employer-domain", "Acme.com", ...activation]).flags
    expect(registerPayload(flags)).toEqual({
      ok: true,
      payload: {
        provider: "greenhouse",
        slug: "greenhouse:acme",
        displayName: "Acme",
        sourceIdentifier: "Acme",
        region: "global",
        employerName: "Acme",
        employerDomain: "acme.com",
        accessMethod: "documented_https_json",
        approvedUsage: "Store public fields",
        attributionRequirements: "Name Greenhouse",
        retentionRestrictions: "Expire omitted",
        allowedStorageFields: ["title", "urls"],
      },
    })
    expect(registerPayload(parseArgs(["register", "--provider", "indeed", "--identifier", "x"]).flags)).toMatchObject({ ok: false })
    expect(
      registerPayload(parseArgs(["register", "--provider", "lever", "--identifier", "x", "--employer-name", "X"]).flags),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/--usage/) })
  })

  it("approves as a non-live draft by default and refuses live without approval, terms, and a limit", () => {
    expect(approvePayload(parseArgs(["approve", "--slug", "greenhouse:acme", ...activation]).flags)).toMatchObject({
      ok: true,
      payload: { approvalStatus: "draft", termsStatus: "unclear", refreshLimitPerDay: 0, liveIngestionEnabled: false },
    })
    expect(approvePayload(parseArgs(["approve", "--slug", "greenhouse:acme", "--live", ...activation]).flags)).toMatchObject({
      ok: false,
    })
    expect(
      approvePayload(
        parseArgs(["approve", "--slug", "greenhouse:acme", "--status", "approved", "--terms", "permitted", "--refresh-limit", "25", ...activation]).flags,
      ),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/0 to 24/) })
    expect(
      approvePayload(
        parseArgs([
          "approve", "--slug", "greenhouse:acme", "--status", "approved", "--terms", "permitted", "--refresh-limit", "1", "--live", ...activation,
        ]).flags,
      ),
    ).toMatchObject({ ok: true, payload: { liveIngestionEnabled: true, refreshLimitPerDay: 1 } })
  })
})
