"use client"

import { useActionState, useMemo } from "react"

import { ApplicationForm, type ApplicationFormValues } from "@/components/records/application-form"
import { FormStatus } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { startAnalysis } from "@/lib/analyze/actions"
import { importPastedPosting, type PasteImportState } from "@/lib/jobs/paste-actions"
import { planCompany } from "@/lib/jobs/prefill"
import { initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"

type Companies = Array<{ id: string; name: string }>

/**
 * Add application with an optional "Paste job posting" step. The grounded fields prefill the
 * normal form, which the user reviews and saves; nothing is saved by the import itself.
 */
export function NewApplicationWithImport({
  action,
  companies,
  values,
  openImport,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>
  companies: Companies
  values: ApplicationFormValues
  openImport: boolean
}) {
  const [state, importAction, importing] = useActionState(importPastedPosting, { status: "idle" } as PasteImportState)
  const ready = state.status === "ready" ? state : null

  const formValues = useMemo<ApplicationFormValues>(() => {
    if (!ready) return values
    const plan = planCompany(companies, ready.prefill.company)
    return {
      ...values,
      ...ready.prefill,
      nextFollowUpDate: "",
      companyMode: plan.mode,
      companyId: plan.companyId,
      newCompanyName: plan.newCompanyName,
    }
  }, [ready, values, companies])
  const ambiguous = ready && planCompany(companies, ready.prefill.company).ambiguous

  return (
    <>
      <details className="surface p-4" open={openImport || undefined}>
        <summary className="cursor-pointer text-sm font-medium">Paste job posting</summary>
        <form action={importAction} className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            For postings from Workday, LinkedIn, or a company site. Paste the text; AI proposes the fields below, and only values found in your text are filled in. Review them before you save.
          </p>
          <input type="hidden" name="executionMode" value="byok" />
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="postingText">
            Posting text
            <Textarea id="postingText" name="postingText" rows={8} required maxLength={30000} defaultValue={ready?.text ?? ""} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="postingUrl">
            Copied from (optional link)
            <Input id="postingUrl" name="postingUrl" type="url" inputMode="url" placeholder="https://" aria-describedby="postingUrl-note" />
            <span id="postingUrl-note" className="text-xs font-normal text-muted-foreground">
              Saved with the application. The app does not open it.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={importing}>
              {importing ? "Reading posting…" : "Fill in from posting"}
            </Button>
            <span className="text-xs text-muted-foreground">Your key</span>
          </div>
          {state.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
        </form>
        {ready ? <ImportResult ready={ready} /> : null}
      </details>
      <ApplicationForm
        // A new import remounts the form so its fields show the new values.
        key={ready ? `import-${ready.text.length}-${ready.filled}-${ready.prefill.jobTitle}-${ready.prefill.company}` : "manual"}
        action={action}
        companies={companies}
        submitLabel="Create application"
        cancelHref="/applications"
        companyNotice={
          ambiguous
            ? `More than one of your companies is named ${ready?.prefill.company}. Choose one before saving. Creating a new company is also an explicit choice.`
            : null
        }
        values={formValues}
      />
    </>
  )
}

function ImportResult({ ready }: { ready: Extract<PasteImportState, { status: "ready" }> }) {
  const [analysisState, analyze, analyzing] = useActionState(startAnalysis, initialRecordFormState)
  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4" role="status">
      <p className="text-sm">
        Filled {ready.filled} {ready.filled === 1 ? "field" : "fields"} from your text. Review each one below before saving.
      </p>
      <p className="text-xs text-muted-foreground">
        AI-proposed · unverified · {ready.model} · Your key
        {ready.dropped > 0 ? ` · ${ready.dropped} left blank because the text did not support them` : ""}
      </p>
      <form action={analyze} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="jdText" value={ready.text} />
        <input type="hidden" name="title" value={ready.prefill.jobTitle} />
        <input type="hidden" name="company" value={ready.prefill.company} />
        <input type="hidden" name="executionMode" value="byok" />
        <Button type="submit" variant="outline" size="sm" disabled={analyzing}>
          {analyzing ? "Analyzing…" : "Analyze fit on this text"}
        </Button>
        <span className="text-xs text-muted-foreground">Your key</span>
      </form>
      <FormStatus state={analysisState} />
    </div>
  )
}
