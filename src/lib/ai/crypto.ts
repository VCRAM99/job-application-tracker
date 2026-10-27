import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { AiRequestError, AI_ERROR_MESSAGES, type ProviderId } from "@/lib/ai/types"

export type KeyRing = {
  currentVersion: string
  keys: Record<string, Buffer>
}

export type EncryptedSecret = {
  ciphertext: string
  nonce: string
  authTag: string
  keyVersion: string
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function parseKeyRing(env: Record<string, string | undefined> = process.env): KeyRing | null {
  const raw = env.AI_CREDENTIALS_KEY?.trim()
  if (!raw) return null
  const version = env.AI_CREDENTIALS_KEY_VERSION?.trim() || "1"
  const key = decodeKey(raw)
  if (key.length !== 32) {
    throw new AiRequestError("encryption_unconfigured", {
      message: "AI_CREDENTIALS_KEY must be 32 bytes, encoded as base64 or hex.",
    })
  }
  return { currentVersion: version, keys: { [version]: key } }
}

/** Says why provider keys cannot be stored, or null when the key ring is usable. Never includes the key. */
export function credentialConfigError(env: Record<string, string | undefined> = process.env): string | null {
  try {
    return parseKeyRing(env) ? null : AI_ERROR_MESSAGES.encryption_unconfigured
  } catch (error) {
    return error instanceof AiRequestError ? error.message : AI_ERROR_MESSAGES.encryption_unconfigured
  }
}

export function encryptSecret(plaintext: string, ring: KeyRing): EncryptedSecret {
  const key = ring.keys[ring.currentVersion]
  if (!key) throw new AiRequestError("encryption_unconfigured")
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: ring.currentVersion,
  }
}

export function decryptSecret(secret: EncryptedSecret, ring: KeyRing): string {
  const key = ring.keys[secret.keyVersion]
  if (!key) throw new AiRequestError("encryption_unconfigured")
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.nonce, "base64"))
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64"))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final(),
    ])
    return plain.toString("utf8")
  } catch {
    throw new AiRequestError("invalid_credentials")
  }
}

export function lastFour(secret: string): string {
  const trimmed = secret.trim()
  if (trimmed.length < 8) throw new AiRequestError("invalid_credentials")
  return trimmed.slice(-4)
}

export function credentialShapeError(provider: ProviderId, secret: string): string | null {
  const trimmed = secret.trim()
  if (trimmed.length < 20 || /\s/.test(trimmed)) {
    return "Enter the full provider key with no spaces."
  }
  if (provider === "openai" && !trimmed.startsWith("sk-")) {
    return "OpenAI keys start with sk-."
  }
  if (provider === "anthropic" && !trimmed.startsWith("sk-ant-")) {
    return "Anthropic keys start with sk-ant-."
  }
  return null
}

function decodeKey(raw: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex")
  return Buffer.from(raw, "base64")
}
