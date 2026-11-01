import { extractText, getDocumentProxy } from "unpdf"

import { MAX_RESUME_TEXT, MIN_PDF_TEXT, type ResumeKind } from "@/lib/resume/constants"
import { docxParts } from "@/lib/resume/files"

export type Extraction = { ok: true; text: string; truncated: boolean } | { ok: false; reason: string }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""
    }
    return ENTITIES[entity.toLowerCase()] ?? ""
  })
}

/**
 * Same input, same text. Each line is trimmed with inner runs of spaces and
 * tabs collapsed, control characters are removed, and blank runs collapse to
 * one empty line.
 */
export function normalizeResumeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Paragraph text from word/document.xml: w:t runs, w:tab as a space, w:br and w:cr as line breaks. */
export function docxXmlToText(xml: string): string {
  const body = xml.replace(/<w:(?:del|instrText|delText)\b[\s\S]*?<\/w:(?:del|instrText|delText)>/g, "")
  const paragraphs = body.match(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []
  return paragraphs
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)]
        .map((match) => (match[2] ? (match[2] === "tab" ? " " : "\n") : decodeXml(match[1] ?? "")))
        .join(""),
    )
    .join("\n")
}

function capped(text: string): Extraction {
  const normalized = normalizeResumeText(text)
  if (!normalized) return { ok: false, reason: "no_text" }
  if (normalized.length <= MAX_RESUME_TEXT) return { ok: true, text: normalized, truncated: false }
  return { ok: true, text: normalized.slice(0, MAX_RESUME_TEXT).trimEnd(), truncated: true }
}

export async function extractResumeText(kind: ResumeKind, bytes: Uint8Array): Promise<Extraction> {
  if (kind === "docx") {
    const parts = docxParts(bytes)
    if (!parts.ok) return parts
    const document = parts.files["word/document.xml"]
    if (!document) return { ok: false, reason: "not_docx" }
    return capped(docxXmlToText(new TextDecoder().decode(document)))
  }
  let pages: string[]
  try {
    // pdf.js may detach the buffer it is given, so it reads a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    pages = (await extractText(pdf, { mergePages: false })).text
  } catch {
    return { ok: false, reason: "unreadable_pdf" }
  }
  const text = pages.join("\n\n")
  if (text.replace(/\s/g, "").length < MIN_PDF_TEXT) return { ok: false, reason: "image_only" }
  return capped(text)
}
