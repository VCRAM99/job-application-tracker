// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"

import { strToU8, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { MAX_RESUME_TEXT } from "@/lib/resume/constants"
import { docxXmlToText, extractResumeText, normalizeResumeText } from "@/lib/resume/extract"
import { checkResumeFile, isOwnedResumePath, kindFromPath } from "@/lib/resume/files"
import { AVERY_LINES } from "@/lib/resume/fixtures/avery"

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/resume/fixtures", name)))
const USER = "11111111-1111-4111-8111-111111111111"
const FILE = "22222222-2222-4222-8222-222222222222"

function docxWith(parts: Record<string, string>) {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([name, body]) => [name, strToU8(body)])))
}
const CONTENT_TYPES = '<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'

describe("resume text extraction", () => {
  it.each(["avery.docx", "avery.pdf"])("extracts every line of %s deterministically", async (name) => {
    const bytes = fixture(name)
    const kind = kindFromPath(name)!
    expect(checkResumeFile(bytes, kind)).toEqual({ ok: true, kind })
    const first = await extractResumeText(kind, bytes)
    const second = await extractResumeText(kind, bytes)
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    for (const line of AVERY_LINES) expect(first.text).toContain(normalizeResumeText(line))
    expect(first.truncated).toBe(false)
  })

  it("rejects an image-only PDF with a clear reason", async () => {
    await expect(extractResumeText("pdf", fixture("scanned.pdf"))).resolves.toEqual({ ok: false, reason: "image_only" })
  })

  it("reads paragraphs, tabs, breaks, and entities from WordprocessingML and skips deleted text", () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Lead</w:t><w:tab/><w:t xml:space="preserve">&amp; mentor </w:t></w:r></w:p>' +
      "<w:p><w:r><w:t>Line</w:t><w:br/><w:t>two</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p><w:p/></w:body></w:document>"
    expect(normalizeResumeText(docxXmlToText(xml))).toBe("Lead & mentor\nLine\ntwo")
  })

  it("caps extracted text at the career source limit", async () => {
    const long = Array.from({ length: 9_000 }, (_, index) => `<w:p><w:r><w:t>Bullet ${index} shipped work</w:t></w:r></w:p>`).join("")
    const result = await extractResumeText("docx", docxWith({ "[Content_Types].xml": CONTENT_TYPES, "word/document.xml": `<w:body>${long}</w:body>` }))
    expect(result).toMatchObject({ ok: true, truncated: true })
    if (result.ok) expect(result.text.length).toBeLessThanOrEqual(MAX_RESUME_TEXT)
  })
})

describe("resume file checks", () => {
  it("takes the type from magic bytes and requires the extension to agree", () => {
    const pdf = fixture("avery.pdf")
    expect(checkResumeFile(pdf, "docx")).toEqual({ ok: false, reason: "type_mismatch" })
    expect(checkResumeFile(strToU8("<html>%PDF-1.7</html>"), "pdf")).toEqual({ ok: false, reason: "unsupported_type" })
    expect(checkResumeFile(new Uint8Array(), "pdf")).toEqual({ ok: false, reason: "empty" })
    expect(checkResumeFile(new Uint8Array(5 * 1024 * 1024 + 1).fill(0x25), "pdf")).toEqual({ ok: false, reason: "too_large" })
  })

  it("rejects a zip that is not a DOCX, a macro-enabled DOCX, and a polyglot", () => {
    expect(checkResumeFile(docxWith({ "hello.txt": "hi" }), "docx")).toEqual({ ok: false, reason: "not_docx" })
    const macro = docxWith({
      "[Content_Types].xml": CONTENT_TYPES.replace("document.main+xml", "document.macroEnabled.main+xml"),
      "word/document.xml": "<w:body/>",
    })
    expect(checkResumeFile(macro, "docx")).toEqual({ ok: false, reason: "macros_not_allowed" })
    const polyglot = new Uint8Array([...strToU8("%PDF-1.7\n"), ...fixture("avery.docx")])
    expect(checkResumeFile(polyglot, "docx")).toEqual({ ok: false, reason: "type_mismatch" })
    expect(checkResumeFile(fixture("avery.docx"), "docx")).toEqual({ ok: true, kind: "docx" })
  })

  it("refuses a DOCX whose parts claim more than 20 MB uncompressed", () => {
    const bomb = zipSync({ "[Content_Types].xml": strToU8(CONTENT_TYPES), "word/document.xml": new Uint8Array(21 * 1024 * 1024) })
    expect(checkResumeFile(bomb, "docx")).toEqual({ ok: false, reason: "too_large_uncompressed" })
  })

  it("accepts only <user>/<uuid>.pdf|docx paths", () => {
    expect(isOwnedResumePath(USER, `${USER}/${FILE}.pdf`)).toBe(true)
    expect(isOwnedResumePath(USER, `${USER}/${FILE}.docx`)).toBe(true)
    for (const path of [
      `${FILE}/${FILE}.pdf`,
      `${USER}/../${FILE}/${FILE}.pdf`,
      `${USER}/${FILE}.pdf/../x.pdf`,
      `${USER}/${FILE}.exe`,
      `${USER}/sub/${FILE}.pdf`,
      `/${USER}/${FILE}.pdf`,
      `${USER}/ABCDEF12-2222-4222-8222-222222222222.pdf`,
    ]) {
      expect(isOwnedResumePath(USER, path)).toBe(false)
    }
  })
})
