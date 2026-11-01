/**
 * Writes the fictional resume fixtures used by src/lib/resume tests.
 *   npx tsx scripts/fixtures/resume-fixtures.mts
 */
import { writeFileSync } from "node:fs"
import path from "node:path"

import { Document as PdfDocument, Page, Rect, Svg, Text, renderToBuffer } from "@react-pdf/renderer"
import { Document, Packer, Paragraph } from "docx"
import { createElement as h } from "react"

import { AVERY_LINES } from "../../src/lib/resume/fixtures/avery"

const out = path.join(process.cwd(), "src/lib/resume/fixtures")

const docx = new Document({
  creator: "fixture",
  title: "Avery Quill",
  description: "fixture",
  sections: [{ children: AVERY_LINES.map((line) => new Paragraph({ text: line })) }],
})
writeFileSync(path.join(out, "avery.docx"), await Packer.toBuffer(docx))

const pdf = await renderToBuffer(
  h(PdfDocument, { creator: "fixture", producer: "fixture", title: "Avery Quill" },
    h(Page, { size: "LETTER", style: { padding: 48, fontSize: 10 } },
      ...AVERY_LINES.map((line, index) => h(Text, { key: index }, line)))),
)
writeFileSync(path.join(out, "avery.pdf"), pdf)

const scanned = await renderToBuffer(
  h(PdfDocument, { creator: "fixture", producer: "fixture" },
    h(Page, { size: "LETTER" },
      h(Svg, { width: 400, height: 300 }, h(Rect, { x: 10, y: 10, width: 380, height: 280, fill: "#888888" })))),
)
writeFileSync(path.join(out, "scanned.pdf"), scanned)
console.log("wrote avery.docx, avery.pdf, scanned.pdf")
