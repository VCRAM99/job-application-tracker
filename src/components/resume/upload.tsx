"use client"

import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { HelpTip } from "@/components/ui/help-tip"
import { registerResume } from "@/lib/resume/actions"
import { DOCX_MIME, MAX_RESUME_BYTES, MAX_STORED_RESUME_FILES, PDF_MIME, RESUME_BUCKET } from "@/lib/resume/constants"

const ACCEPT = `.pdf,.docx,${PDF_MIME},${DOCX_MIME}`

/** Uploads straight to Storage under the user's own prefix, then asks the server to register and check it. */
export function ResumeUpload({ userId }: { userId: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  async function upload(file: File) {
    setError(null)
    const extension = file.name.toLowerCase().endsWith(".docx") ? "docx" : file.name.toLowerCase().endsWith(".pdf") ? "pdf" : null
    if (!extension) return setError("Upload a PDF or a Word (.docx) file.")
    if (file.size > MAX_RESUME_BYTES) return setError("Resumes must be 5 MB or smaller.")
    setBusy(true)
    try {
      const path = `${userId}/${crypto.randomUUID()}.${extension}`
      // The Supabase browser client loads on the first upload, not with the page.
      const { createClient } = await import("@/lib/supabase/client")
      const uploaded = await createClient()
        .storage.from(RESUME_BUCKET)
        .upload(path, file, { contentType: extension === "pdf" ? PDF_MIME : DOCX_MIME, upsert: false })
      if (uploaded.error) {
        // The Storage policy refuses new files past the per-user cap with a row-level security error.
        return setError(
          /row-level security/i.test(uploaded.error.message)
            ? `You can keep up to ${MAX_STORED_RESUME_FILES} resume files. Delete one you no longer need, then upload again.`
            : "The upload did not finish. Try again.",
        )
      }
      const registered = await registerResume({ path, label: file.name })
      if (!registered.ok) return setError(registered.message)
      router.push(`/resumes/${registered.id}`)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Resume file"
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : "Upload resume"}
        </Button>
        <HelpTip label="About uploads">
          PDF or Word, up to 5 MB. The original file is stored privately and never changed. Scanned PDFs without selectable text are not supported.
        </HelpTip>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
