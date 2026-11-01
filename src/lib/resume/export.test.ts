// @vitest-environment node
import { unzipSync, strFromU8 } from "fflate"
import { describe, expect, it } from "vitest"

import type { ResumeContent } from "@/lib/resume/content"
import { buildDocx, buildPdf, contentDisposition } from "@/lib/resume/export"
import { extractResumeText } from "@/lib/resume/extract"
import { checkResumeFile } from "@/lib/resume/files"

const content: ResumeContent = {
  contact: { name: "Avery Quill", email: "avery.quill@example.com", phone: "+1 555 0100", location: "Toronto, Canada", links: [] },
  summary: "Backend engineer with 6 years building payment and data services.",
  experience: [
    {
      title: "Senior Backend Engineer",
      company: "Lumen Ridge Labs",
      location: "Toronto",
      start: "Jan 2022",
      end: "Present",
      bullets: ["Cut p95 checkout latency by 40% by moving fraud checks to an async queue."],
    },
  ],
  education: [{ credential: "BSc Computer Science", institution: "Northgate University", year: "2019", details: [] }],
  skills: ["TypeScript", "PostgreSQL", "Kafka"],
  projects: [{ name: "Ledgerlite", bullets: ["Open-source double-entry ledger library in TypeScript."] }],
  other: [],
}
const date = new Date("2026-11-02T10:00:00.000Z")

describe("resume export", () => {
  it("builds a valid, deterministic DOCX that reads back with the same text", async () => {
    const first = await buildDocx(content, date)
    const second = await buildDocx(content, date)
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
    expect(checkResumeFile(first, "docx")).toEqual({ ok: true, kind: "docx" })
    expect(strFromU8(unzipSync(first)["docProps/core.xml"]!)).toContain("2026-11-02T10:00:00Z")
    const text = await extractResumeText("docx", first)
    expect(text.ok && text.text).toContain("Cut p95 checkout latency by 40%")
    expect(text.ok && text.text).toContain("TypeScript, PostgreSQL, Kafka")
  })

  it("builds a valid, deterministic PDF with selectable text", async () => {
    const first = await buildPdf(content, date)
    const second = await buildPdf(content, date)
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
    expect(checkResumeFile(first, "pdf")).toEqual({ ok: true, kind: "pdf" })
    const text = await extractResumeText("pdf", first)
    expect(text.ok).toBe(true)
    if (text.ok) {
      expect(text.text).toContain("Lumen Ridge Labs")
      expect(text.text).toContain("Ledgerlite")
    }
  })

  it("names the download safely", () => {
    expect(contentDisposition("Avery Quill · Backend Engineer", "pdf")).toBe(
      `attachment; filename="Avery-Quill-Backend-Engineer.pdf"; filename*=UTF-8''${encodeURIComponent("Avery Quill · Backend Engineer.pdf")}`,
    )
    expect(contentDisposition('../"evil"\r\n', "docx")).toMatch(/^attachment; filename="evil\.docx"; filename\*=UTF-8''/)
    expect(contentDisposition("", "docx")).toContain('filename="Resume.docx"')
    expect(contentDisposition("Siobhán O'Brien (2)", "pdf")).toContain("filename*=UTF-8''Siobh%C3%A1n%20O%27Brien%20%282%29.pdf")
  })
})
