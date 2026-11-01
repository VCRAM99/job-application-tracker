"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"

import { createCareerSource } from "@/lib/career/actions"
import { requireUser } from "@/lib/auth/session"
import { initialRecordFormState, isUuid, type RecordFormState } from "@/lib/records/form-state"
import { MIME_BY_KIND, RESUME_BUCKET } from "@/lib/resume/constants"
import { extractResumeText } from "@/lib/resume/extract"
import { checkResumeFile, FILE_ERROR_MESSAGES, isOwnedResumePath, kindFromPath } from "@/lib/resume/files"
import { resumeStudioEnabled } from "@/lib/resume/flags"
import { createClient } from "@/lib/supabase/server"

export type RegisterResult = { ok: true; id: string; existing: boolean } | { ok: false; message: string }

const OFF = "Resume Studio is turned off."

function labelFrom(value: string): string {
  return value.replace(/\.(pdf|docx)$/i, "").replace(/\s+/g, " ").trim().slice(0, 120) || "Resume"
}

/**
 * Registers a file the browser already uploaded to Storage. The path must be
 * the caller's own, and the bytes are checked again here: type from magic
 * bytes, size, and extractable text. A rejected file is removed.
 */
export async function registerResume(input: { path: string; label: string }): Promise<RegisterResult> {
  if (!resumeStudioEnabled()) return { ok: false, message: OFF }
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
    await discard()
    if (inserted.error.code === "23505") {
      const existing = await supabase.from("resumes").select("id").eq("user_id", user.id).eq("sha256", sha256).maybeSingle()
      if (existing.data) return { ok: true, id: String(existing.data.id), existing: true }
    }
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
  if (!resumeStudioEnabled()) return { status: "error", message: OFF, fieldErrors: {} }
  const user = await requireUser()
  const id = String(formData.get("resumeId") ?? "")
  if (!isUuid(id)) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
  const supabase = await createClient()
  const found = await supabase.from("resumes").select("storage_path").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (found.error || !found.data) return { status: "error", message: "That resume could not be found.", fieldErrors: {} }
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
  if (!resumeStudioEnabled()) return { status: "error", message: OFF, fieldErrors: {} }
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
