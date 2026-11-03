import "server-only"

import path from "node:path"

import { Document as PdfDocument, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { createElement as h, type ReactElement } from "react"

import type { ResumeContent } from "@/lib/resume/content"

/** One clean single-column layout: plain headings, plain bullets, no tables, columns, images, or text boxes. */
type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "entry"; text: string; meta: string | null }
  | { kind: "line"; text: string }
  | { kind: "bullet"; text: string }

export function resumeBlocks(content: ResumeContent): Block[] {
  const blocks: Block[] = []
  if (content.contact.name) blocks.push({ kind: "name", text: content.contact.name })
  const contact = [content.contact.email, content.contact.phone, content.contact.location, ...content.contact.links].filter(
    (value): value is string => Boolean(value),
  )
  if (contact.length > 0) blocks.push({ kind: "contact", text: contact.join(" | ") })
  if (content.summary) blocks.push({ kind: "heading", text: "Summary" }, { kind: "line", text: content.summary })
  if (content.experience.length > 0) {
    blocks.push({ kind: "heading", text: "Experience" })
    for (const job of content.experience) {
      const dates = [job.start, job.end].filter(Boolean).join(" - ")
      blocks.push({
        kind: "entry",
        text: `${job.title}, ${job.company}`,
        meta: [job.location, dates].filter(Boolean).join(" | ") || null,
      })
      for (const bullet of job.bullets) blocks.push({ kind: "bullet", text: bullet })
    }
  }
  if (content.education.length > 0) {
    blocks.push({ kind: "heading", text: "Education" })
    for (const item of content.education) {
      blocks.push({ kind: "entry", text: `${item.credential}, ${item.institution}`, meta: item.year })
      for (const detail of item.details) blocks.push({ kind: "bullet", text: detail })
    }
  }
  if (content.skills.length > 0) blocks.push({ kind: "heading", text: "Skills" }, { kind: "line", text: content.skills.join(", ") })
  if (content.projects.length > 0) {
    blocks.push({ kind: "heading", text: "Projects" })
    for (const project of content.projects) {
      blocks.push({ kind: "entry", text: project.name, meta: null })
      for (const bullet of project.bullets) blocks.push({ kind: "bullet", text: bullet })
    }
  }
  for (const section of content.other) {
    blocks.push({ kind: "heading", text: section.heading })
    for (const line of section.lines) blocks.push({ kind: "line", text: line })
  }
  return blocks
}

function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

/**
 * The docx package stamps the current time into docProps/core.xml and the zip
 * entries. Rewriting both with the version date makes the same content give
 * the same bytes.
 */
function pinDocx(bytes: Uint8Array, date: Date): Uint8Array {
  const files = unzipSync(bytes)
  const core = files["docProps/core.xml"]
  if (core) {
    files["docProps/core.xml"] = strToU8(
      strFromU8(core).replace(
        /(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g,
        `$1${isoSeconds(date)}$2`,
      ),
    )
  }
  const names = Object.keys(files).sort()
  return zipSync(Object.fromEntries(names.map((name) => [name, [files[name] as Uint8Array, { mtime: date, level: 6 }]])))
}

export async function buildDocx(content: ResumeContent, date: Date): Promise<Uint8Array> {
  const children = resumeBlocks(content).map((block) => {
    switch (block.kind) {
      case "name":
        return new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: block.text, bold: true })] })
      case "contact":
        return new Paragraph({ text: block.text, spacing: { after: 200 } })
      case "heading":
        return new Paragraph({ heading: HeadingLevel.HEADING_1, text: block.text, spacing: { before: 240, after: 80 } })
      case "entry":
        return new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: block.text, bold: true }), ...(block.meta ? [new TextRun({ text: ` | ${block.meta}` })] : [])],
        })
      case "bullet":
        return new Paragraph({ text: block.text, bullet: { level: 0 } })
      default:
        return new Paragraph({ text: block.text })
    }
  })
  const document = new Document({
    creator: "Job Tracker",
    lastModifiedBy: "Job Tracker",
    title: content.contact.name ?? "Resume",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: {}, children }],
  })
  return pinDocx(new Uint8Array(await Packer.toBuffer(document)), date)
}

/**
 * Noto Sans (SIL OFL 1.1, src/lib/resume/fonts/OFL.txt) in three subsets, regular and bold, so
 * names and text in Latin Extended (Polish, Czech, Turkish, …) and Vietnamese render instead of
 * dropping glyphs. react-pdf tries each family in order for every character. CJK, Arabic, and
 * other scripts are not embedded (docs/resume-studio.md). Server-only; next.config.ts traces the
 * files into the export route.
 */
const FONT_DIR = path.join(process.cwd(), "src/lib/resume/fonts")
export const PDF_FONT_FAMILIES = ["NotoSansLatin", "NotoSansLatinExt", "NotoSansVietnamese"]
const SUBSETS: Record<string, string> = { NotoSansLatin: "latin", NotoSansLatinExt: "latin-ext", NotoSansVietnamese: "vietnamese" }
let fontsRegistered = false
function registerFonts() {
  if (fontsRegistered) return
  for (const family of PDF_FONT_FAMILIES) {
    Font.register({
      family,
      fonts: [400, 700].map((weight) => ({ src: path.join(FONT_DIR, `noto-sans-${SUBSETS[family]}-${weight}-normal.woff`), fontWeight: weight })),
    })
  }
  // Keep words whole; the default hyphenation splits names.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

const styles = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 54, fontFamily: PDF_FONT_FAMILIES, fontSize: 10.5, lineHeight: 1.35 },
  name: { fontWeight: 700, fontSize: 18, marginBottom: 2 },
  contact: { marginBottom: 10 },
  heading: { fontWeight: 700, fontSize: 12, marginTop: 10, marginBottom: 4 },
  entry: { fontWeight: 700, marginTop: 6 },
  bullet: { flexDirection: "row", marginLeft: 8 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
})

export async function buildPdf(content: ResumeContent, date: Date): Promise<Uint8Array> {
  registerFonts()
  const nodes: ReactElement[] = resumeBlocks(content).map((block, index) => {
    switch (block.kind) {
      case "name":
        return h(Text, { key: index, style: styles.name }, block.text)
      case "contact":
        return h(Text, { key: index, style: styles.contact }, block.text)
      case "heading":
        return h(Text, { key: index, style: styles.heading }, block.text)
      case "entry":
        return h(Text, { key: index, style: styles.entry }, block.meta ? `${block.text} | ${block.meta}` : block.text)
      case "bullet":
        return h(View, { key: index, style: styles.bullet }, h(Text, { style: styles.dot }, "•"), h(Text, { style: styles.bulletText }, block.text))
      default:
        return h(Text, { key: index }, block.text)
    }
  })
  const document = h(
    PdfDocument,
    {
      title: content.contact.name ?? "Resume",
      author: content.contact.name ?? undefined,
      creator: "Job Tracker",
      producer: "Job Tracker",
      creationDate: date,
      modificationDate: date,
    },
    h(Page, { size: "LETTER", style: styles.page, wrap: true }, ...nodes),
  )
  return new Uint8Array(await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]))
}

/** ASCII file name from the person and version label, plus an RFC 5987 UTF-8 copy. */
export function contentDisposition(base: string, extension: "docx" | "pdf"): string {
  const ascii =
    base
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "Resume"
  const utf8 = encodeURIComponent(`${base.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 120) || "Resume"}.${extension}`).replace(
    /['()*!]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}.${extension}"; filename*=UTF-8''${utf8}`
}
