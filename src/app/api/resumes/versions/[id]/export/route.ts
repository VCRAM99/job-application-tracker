import { getCurrentUser } from "@/lib/auth/session"
import { isUuid } from "@/lib/records/form-state"
import { resumeContentSchema, type ResumeContent } from "@/lib/resume/content"
import { DOCX_MIME, PDF_MIME } from "@/lib/resume/constants"
import { buildDocx, buildPdf, contentDisposition } from "@/lib/resume/export"
import { createClient } from "@/lib/supabase/server"
import { resumesAllowed } from "@/lib/beta"

/** Builds a DOCX or PDF from a version's final content: accepted edits only. Nothing is stored. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await resumesAllowed())) return new Response("Not found", { status: 404 })
  const user = await getCurrentUser()
  if (!user) return new Response("Sign in required", { status: 401 })
  const { id } = await params
  const format = new URL(request.url).searchParams.get("format")
  if (!isUuid(id) || (format !== "docx" && format !== "pdf")) return new Response("Not found", { status: 404 })
  const supabase = await createClient()
  const version = await supabase
    .from("resume_versions")
    .select("label, final_content, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (version.error || !version.data) return new Response("Not found", { status: 404 })
  const parsed = resumeContentSchema.safeParse(version.data.final_content)
  if (!parsed.success) return new Response("This version cannot be exported.", { status: 422 })
  const content = parsed.data as ResumeContent
  const date = new Date(String(version.data.updated_at))
  const bytes = format === "docx" ? await buildDocx(content, date) : await buildPdf(content, date)
  const base = [content.contact.name, String(version.data.label)].filter(Boolean).join(" ")
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": format === "docx" ? DOCX_MIME : PDF_MIME,
      "content-disposition": contentDisposition(base, format),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
