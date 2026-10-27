import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user-1", email: null })) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }))

import { decryptSecret, parseKeyRing } from "@/lib/ai/crypto"
import { saveProviderCredential } from "@/lib/career/actions"
import { initialRecordFormState } from "@/lib/records/form-state"

const GEMINI_KEY = "AIzaFictionalGeminiKeyForTests0123456789"

function form() {
  const data = new FormData()
  data.set("provider", "google")
  data.set("secret", GEMINI_KEY)
  return data
}

describe("saving a provider key", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  beforeEach(() => {
    rpc.mockReset()
    log.mockClear()
    vi.stubEnv("AI_FEATURES_ENABLED", "true")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("says which server setting is missing and logs it without the key", async () => {
    vi.stubEnv("AI_CREDENTIALS_KEY", "")
    const unset = await saveProviderCredential(initialRecordFormState, form())
    expect(unset).toMatchObject({ status: "error", message: expect.stringMatching(/AI_CREDENTIALS_KEY is set/) })

    vi.stubEnv("AI_CREDENTIALS_KEY", "too-short")
    const malformed = await saveProviderCredential(initialRecordFormState, form())
    expect(malformed).toMatchObject({ status: "error", message: expect.stringMatching(/must be 32 bytes/) })

    expect(rpc).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(log.mock.calls)).not.toContain(GEMINI_KEY)
  })

  it("stores a Gemini key encrypted and returns no key material", async () => {
    vi.stubEnv("AI_CREDENTIALS_KEY", Buffer.alloc(32, 3).toString("base64"))
    rpc.mockResolvedValue({ data: "cred-1", error: null })
    const result = await saveProviderCredential(initialRecordFormState, form())

    expect(result).toMatchObject({ status: "idle", message: expect.stringMatching(/Key saved/) })
    expect(JSON.stringify(result)).not.toContain(GEMINI_KEY)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe("rotate_ai_credential")
    expect(JSON.stringify(args)).not.toContain(GEMINI_KEY)
    expect(args).toMatchObject({ p_provider: "google", p_last_four: "6789" })
    const ring = parseKeyRing()!
    expect(
      decryptSecret(
        { ciphertext: args.p_ciphertext, nonce: args.p_nonce, authTag: args.p_auth_tag, keyVersion: args.p_key_version },
        ring,
      ),
    ).toBe(GEMINI_KEY)
  })

  it("logs the database error code when the save fails", async () => {
    vi.stubEnv("AI_CREDENTIALS_KEY", Buffer.alloc(32, 3).toString("base64"))
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not authenticated" } })
    const result = await saveProviderCredential(initialRecordFormState, form())
    expect(result).toMatchObject({ status: "error", message: "The key could not be saved." })
    expect(log.mock.calls[0][0]).toMatch(/rotate_ai_credential failed \(42501\)/)
  })
})
