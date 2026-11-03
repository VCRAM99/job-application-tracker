"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"

import { prepareAiRun, usageReservationDeps } from "@/lib/ai/run-context"
import { AiRequestError, AI_ERROR_MESSAGES } from "@/lib/ai/types"
import { createCareerSource } from "@/lib/career/actions"
import { requireUser } from "@/lib/auth/session"
import { initialRecordFormState, isUuid, type RecordFormState } from "@/lib/records/form-state"
import { MIME_BY_KIND, PARSE_PROMPT_VERSION, PARSE_SCHEMA_VERSION, RESUME_BUCKET } from "@/lib/resume/constants"
import { extractResumeText } from "@/lib/resume/extract"
import { checkResumeFile, FILE_ERROR_MESSAGES, isOwnedResumePath, kindFromPath } from "@/lib/resume/files"
import { sliceChars } from "@/lib/resume/text"
import { parseResumeText } from "@/lib/resume/run-parse"
import { createClient } from "@/lib/supabase/server"
import { resumesAllowed } from "@/lib/beta"

export type RegisterResult = { ok: true; id: string; existing: boolean } | { ok: false; message: string }

const OFF = "Resume Studio is turned off."

function labelFrom(value: string): string {
  return sliceChars(value.replace(/\.(pdf|docx)$/i, "").replace(/\s+/g, " ").trim(), 120) || "Resume"
}

/**
 * Registers a file the browser already uploaded to Storage. The path must be
 * the caller's own, and the bytes are checked again here: type from magic
 * bytes, size, and extractable text. A rejected file is removed.
 */
export async function registerResume(input: { path: string; label: string }): Promise<RegisterResult> {
  if (!(await resumesAllowed())) return { ok: false, message: OFF }
  const user = await requireUser()
  const path = String(input.path ?? "")
  if (!isOwnedResumePath(user.id, path)) return { ok: false, message: "That upload could not be found." }
  const supabase = await createClient()
  const storage = supabase.storage.from(RESUME_BUCKET)
  const discard = async () => {
    await storage.remove([path]).catch(() => undefined)
  }

  const downloaded = await storage.download(path)
  if (downloaded.error || !downloaded.data) return { ok: false, message: "That upload could not be found." }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer())
  const checked = checkResumeFile(bytes, kindFromPath(path))
  if (!checked.ok) {
    await discard()
    return { ok: false, message: FILE_ERROR_MESSAGES[checked.reason] ?? "That file could not be used." }
  }
  const extracted = await extractResumeText(checked.kind, bytes)
  if (!extracted.ok) {
    await discard()
    return { ok: false, message: FILE_ERROR_MESSAGES[extracted.reason] ?? "No text was found in that file." }
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const inserted = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      label: labelFrom(String(input.label ?? "")),
      storage_path: path,
      mime: MIME_BY_KIND[checked.kind],
      size_bytes: bytes.byteLength,
      sha256,
      extracted_text: extracted.text,
    })
    .select("id")
    .single()
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      // Same file or same path already registered. Keep the object if a row points at it.
      const existing = await supabase
        .from("resumes")
        .select("id, storage_path")
        .eq("user_id", user.id)
        .or(`sha256.eq.${sha256},storage_path.eq.${path}`)
        .limit(1)
        .maybeSingle()
      if (existing.data) {
        if (String(existing.data.storage_path) !== path) await discard()
        return { ok: true, id: String(existing.data.id), existing: true }
      }
    }
    await discard()
    console.error(`Resume not registered (${inserted.error.code ?? "no code"}).`)
    return { ok: false, message: "The resume could not be saved." }
  }
  revalidatePath("/resumes")
  return { ok: true, id: String(inserted.data.id), existing: false }
}

/**
 * Deletes the resume row and its original file. Tailored versions keep their
 * own content and lose only the link, because a version attached to an
 * application records what was sent.
 */
export async function deleteResume(formData: FormData): Promise<RecordFormState> {
  if (!(await resumesAllowed())) return { status: "error", message: OFF, fieldErrors: {} }
  const user = await requireUser()
  const id = String(formData.get("resumeId") ?? "")
  if (!isUuid(id)) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  const supabase = await createClient()
  const found = await supabase.from("resumes").select("storage_path").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (found.error || !found.data) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  // Versions linked to an application stay as the record of what was sent. Unlinked versions
  // would be unreachable after the resume is gone, so they are deleted with it.
  const versions = await supabase.from("resume_versions").delete().eq("user_id", user.id).eq("resume_id", id).is("application_id", null)
  if (versions.error) {
    console.error(`Resume versions not deleted (${versions.error.code ?? "no code"}).`)
    return { status: "error", message: "The resume could not be deleted.", fieldErrors: {} }
  }
  const removed = await supabase.from("resumes").delete().eq("id", id).eq("user_id", user.id)
  if (removed.error) {
    console.error(`Resume not deleted (${removed.error.code ?? "no code"}).`)
    return { status: "error", message: "The resume could not be deleted.", fieldErrors: {} }
  }
  const file = await supabase.storage.from(RESUME_BUCKET).remove([String(found.data.storage_path)])
  if (file.error) console.error("Resume file not removed; the row is gone and the object stays under the owner's prefix.")
  revalidatePath("/resumes")
  return { status: "idle", message: "Resume deleted.", fieldErrors: {} }
}

/** Saves the extracted text through the existing career source flow, so facts still start as suggestions. */
export async function saveResumeAsCareerSource(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await resumesAllowed())) return { status: "error", message: OFF, fieldErrors: {} }
  const user = await requireUser()
  const id = String(formData.get("resumeId") ?? "")
  if (!isUuid(id)) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  const supabase = await createClient()
  const found = await supabase.from("resumes").select("label, extracted_text").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (found.error || !found.data) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  const source = new FormData()
  source.set("label", String(found.data.label))
  source.set("body", String(found.data.extracted_text))
  return createCareerSource(initialRecordFormState, source)
}

function requestedMode(formData: FormData): "managed" | "byok" | "local" {
  const value = String(formData.get("executionMode") ?? "")
  return value === "managed" || value === "local" ? value : "byok"
}

/**
 * Parses a resume into sections through the AI gateway. The result is cached
 * on the resume row by prompt version; the reservation is keyed by user,
 * file hash, prompt version, mode, provider, and model.
 */
export async function parseResume(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await resumesAllowed())) return { status: "error", message: OFF, fieldErrors: {} }
  const user = await requireUser()
  const id = String(formData.get("resumeId") ?? "")
  if (!isUuid(id)) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  const supabase = await createClient()
  const found = await supabase
    .from("resumes")
    .select("id, sha256, extracted_text, parse_status, parse_prompt_version")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (found.error || !found.data) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  if (found.data.parse_status === "parsed" && found.data.parse_prompt_version === PARSE_PROMPT_VERSION) {
    return { status: "idle", message: "Already parsed. The model was not called again.", fieldErrors: {} }
  }
  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return { status: "error", message: prepared.message, fieldErrors: {} }
  const run = prepared.run
  const row = found.data
  // The resume id is in the key, so a re-uploaded file is a new parse, not a past reservation.
  const keyFor = (nonce: string) =>
    createHash("sha256")
      .update(["resume-parse", user.id, id, row.sha256, PARSE_PROMPT_VERSION, run.mode, run.provider, run.model, nonce].join("\n"))
      .digest("hex")

  const attempt = (idempotencyKey: string) => parseResumeText({
    text: String(row.extracted_text),
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey, mode: run.mode, provider: run.provider, model: run.model }),
    persist: async (outcome) => {
      const saved = await supabase
        .from("resumes")
        .update({
          parse_status: "parsed",
          parsed: outcome.content,
          parse_dropped: outcome.dropped,
          parse_provider: run.provider,
          parse_model: run.model,
          parse_execution_mode: run.mode,
          parse_prompt_version: PARSE_PROMPT_VERSION,
          parse_schema_version: PARSE_SCHEMA_VERSION,
          parse_error: null,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id)
      // Not retryable: a failed save must not call the model again.
      if (saved.error) throw new AiRequestError("transient", { retryable: false })
    },
  })
  let result = await attempt(keyFor(""))
  if (result.ok && result.kind === "already-complete") {
    const current = await supabase.from("resumes").select("parse_status, parse_prompt_version").eq("id", id).eq("user_id", user.id).maybeSingle()
    if (current.data?.parse_status !== "parsed" || current.data.parse_prompt_version !== PARSE_PROMPT_VERSION) {
      // The reservation succeeded but this row has no parse, so run once more under a fresh key.
      result = await attempt(keyFor(crypto.randomUUID()))
    }
  }
  revalidatePath(`/resumes/${id}`)
  if (result.ok) {
    return {
      status: "idle",
      message: result.kind === "already-complete" ? "Already parsed. The model was not called again." : "Parsed. Items not found in your file were dropped.",
      fieldErrors: {},
    }
  }
  if (result.code !== "in_progress") {
    await supabase
      .from("resumes")
      .update({ parse_status: "failed", parsed: null, parse_error: result.code, parse_provider: null, parse_model: null, parse_execution_mode: null })
      .eq("id", id)
      .eq("user_id", user.id)
      // A failed re-parse keeps an earlier successful parse.
      .neq("parse_status", "parsed")
  }
  return { status: "error", message: AI_ERROR_MESSAGES[result.code] ?? result.message, fieldErrors: {} }
}
