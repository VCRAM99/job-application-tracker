import { unzipSync } from "fflate"

import { MAX_DOCX_XML_BYTES, MAX_RESUME_BYTES, type ResumeKind } from "@/lib/resume/constants"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** Object keys are exactly <user id>/<uuid>.pdf|docx, the same rule the Storage policy enforces. */
export function isOwnedResumePath(userId: string, path: string): boolean {
  return new RegExp(`^${userId.toLowerCase()}/${UUID}\\.(pdf|docx)$`).test(path)
}

export function kindFromPath(path: string): ResumeKind | null {
  if (path.endsWith(".pdf")) return "pdf"
  if (path.endsWith(".docx")) return "docx"
  return null
}

export type FileCheck = { ok: true; kind: ResumeKind } | { ok: false; reason: string }

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

/**
 * The file type comes from the bytes, not the name or the browser's MIME. A
 * PDF must start with %PDF-. A DOCX must be a zip with the WordprocessingML
 * main part and no macros. The declared extension must agree.
 */
export function checkResumeFile(bytes: Uint8Array, expected: ResumeKind | null): FileCheck {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" }
  if (bytes.byteLength > MAX_RESUME_BYTES) return { ok: false, reason: "too_large" }
  let kind: ResumeKind | null = null
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) kind = "pdf"
  else if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) kind = "docx"
  if (!kind) return { ok: false, reason: "unsupported_type" }
  if (expected && kind !== expected) return { ok: false, reason: "type_mismatch" }
  if (kind === "docx") {
    const parts = docxParts(bytes)
    if (!parts.ok) return parts
    const types = parts.files["[Content_Types].xml"]
    if (!types || !parts.files["word/document.xml"]) return { ok: false, reason: "not_docx" }
    const declared = new TextDecoder().decode(types)
    if (/macroEnabled|vbaProject/i.test(declared) || "word/vbaProject.bin" in parts.files) {
      return { ok: false, reason: "macros_not_allowed" }
    }
  }
  return { ok: true, kind }
}

/** Unzips only the parts we read, refusing archives that claim more than MAX_DOCX_XML_BYTES. */
export function docxParts(bytes: Uint8Array): { ok: true; files: Record<string, Uint8Array> } | { ok: false; reason: string } {
  let declared = 0
  try {
    const files = unzipSync(bytes, {
      filter: (file) => {
        const wanted = file.name === "[Content_Types].xml" || file.name === "word/document.xml" || file.name === "word/vbaProject.bin"
        if (!wanted) return false
        declared += file.originalSize
        if (declared > MAX_DOCX_XML_BYTES) throw new Error("too_large_uncompressed")
        return true
      },
    })
    return { ok: true, files }
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.message === "too_large_uncompressed" ? "too_large_uncompressed" : "not_docx" }
  }
}

export const FILE_ERROR_MESSAGES: Record<string, string> = {
  empty: "That file is empty.",
  too_large: "Resumes must be 5 MB or smaller.",
  unsupported_type: "Upload a PDF or a Word (.docx) file.",
  type_mismatch: "The file contents do not match its extension.",
  not_docx: "That Word file could not be read.",
  macros_not_allowed: "Macro-enabled Word files are not accepted.",
  too_large_uncompressed: "That Word file expands to more than 2 MB of text.",
  image_only: "This PDF has no selectable text. Scanned resumes are not supported; export a text PDF or upload the Word file.",
  no_text: "No text was found in that file.",
  unreadable_pdf: "That PDF could not be read.",
}

/** Uploads older than this, with no resume row, are treated as abandoned. */
export const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000

/**
 * Storage objects under the user's own prefix that no resume row points to and that are older
 * than a day: an upload whose registration never finished. Newer objects may still be
 * registering, and anything that does not match the owner path pattern is left alone.
 */
export function abandonedUploadPaths(
  userId: string,
  objects: Array<{ name: string; created_at?: string | null }>,
  registered: ReadonlySet<string>,
  now = new Date(),
): string[] {
  return objects
    .map((object) => ({ path: `${userId.toLowerCase()}/${object.name}`, created: Date.parse(object.created_at ?? "") }))
    .filter(({ path, created }) => isOwnedResumePath(userId, path) && !registered.has(path) && Number.isFinite(created) && now.getTime() - created > ABANDONED_UPLOAD_MS)
    .map(({ path }) => path)
}
