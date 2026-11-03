export const RESUME_BUCKET = "resumes"
export const MAX_RESUME_BYTES = 5 * 1024 * 1024
/** Files one user may keep in the resumes bucket. The Storage insert policy enforces the same number (M6c migration). */
export const MAX_STORED_RESUME_FILES = 30
/** Matches career_sources, so an upload can be saved as a career source unchanged. */
export const MAX_RESUME_TEXT = 80_000
/** A PDF with less selectable text than this is treated as image-only. */
export const MIN_PDF_TEXT = 200
/** Total uncompressed size allowed for the DOCX parts we read. A resume's document.xml is far smaller. */
export const MAX_DOCX_XML_BYTES = 2 * 1024 * 1024

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const PDF_MIME = "application/pdf"
export type ResumeKind = "pdf" | "docx"
export const MIME_BY_KIND: Record<ResumeKind, string> = { pdf: PDF_MIME, docx: DOCX_MIME }

export const PARSE_PROMPT_VERSION = "resume-parse-2026-11-02"
export const PARSE_SCHEMA_VERSION = "resume-parse-schema-1"
export const TAILOR_PROMPT_VERSION = "resume-tailor-2026-11-02"
export const TAILOR_SCHEMA_VERSION = "resume-tailor-schema-1"
