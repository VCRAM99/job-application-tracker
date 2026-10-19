"use client"

import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  APPLICATION_STATUSES,
  COMPANY_SIZES,
  EMPLOYMENT_TYPES,
  PRIORITY_TIERS,
  RESEARCH_STATUSES,
  WORK_ARRANGEMENTS,
} from "@/lib/records/constants"
import { submitImport, type ImportState } from "@/lib/import/actions"
import { canCommit } from "@/lib/import/plan"
import type { ImportKind } from "@/lib/import/format"

const initialState: ImportState = { review: null, result: null, message: null }

export function ImportPanel({ kind }: { kind: ImportKind }) {
  const [filename, setFilename] = useState("")
  const [state, formAction, pending] = useActionState(submitImport, initialState)
  const review = state.review
  const title = kind === "companies" ? "Companies" : "Applications"

  return (
    <div className="flex flex-col gap-6">
      <section className="surface p-4">
        <h2 className="text-sm font-medium">Template</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Download a blank {title.toLowerCase()} template. The header names must match exactly.
          Column order can change. Dates use YYYY-MM-DD. Leave optional cells blank.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`/export/templates/${kind}?format=csv`} />}>
            Download CSV
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={`/export/templates/${kind}?format=xlsx`} />}>
            Download XLSX
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={kind === "companies" ? "/export/companies" : "/export/applications"} />}>
            Export your {title.toLowerCase()}
          </Button>
        </div>
      </section>
      <AcceptedValues kind={kind} />
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="kind" value={kind} />
        <div className="space-y-2">
          <label htmlFor="import-file" className="text-sm font-medium">Spreadsheet</label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(event) => setFilename(event.target.files?.[0]?.name ?? "")}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-background file:px-3 file:py-1.5"
          />
          <p className="text-sm text-muted-foreground" role="status">
            {filename ? `Selected file: ${filename}` : "No file selected. CSV and XLSX only, up to 1 MB and 500 rows."}
          </p>
        </div>
        {state.message ? (
          <p className="text-sm text-destructive" role="alert">{state.message}</p>
        ) : null}
        {state.result ? (
          <p className="surface px-3 py-3 text-sm" role="status">
            Imported {state.result.inserted}. Skipped {state.result.skipped} duplicate
            {state.result.skipped === 1 ? "" : "s"}.
            {state.result.companiesCreated > 0
              ? ` Created ${state.result.companiesCreated} ${state.result.companiesCreated === 1 ? "company" : "companies"}.`
              : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="review" disabled={pending}>
            {pending ? "Checking…" : "Check file"}
          </Button>
          {review && canCommit(review) ? (
            <Button type="submit" name="intent" value="import" disabled={pending}>
              {pending ? "Importing…" : `Import ${review.ready} ${review.ready === 1 ? "row" : "rows"}`}
            </Button>
          ) : null}
        </div>
      </form>
      {review ? <Review review={review} /> : null}
    </div>
  )
}

function Review({ review }: { review: NonNullable<ImportState["review"]> }) {
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm" role="status">
        {review.blocked
          ? `${review.errors.length} ${review.errors.length === 1 ? "row needs" : "rows need"} a correction. Nothing will be saved.`
          : `${review.ready} ready to import, ${review.skipped} duplicates will be skipped${review.companiesToCreate > 0 ? `, ${review.companiesToCreate} new companies` : ""}.`}
      </p>
      {review.errors.length > 0 ? (
        <div className="overflow-x-auto surface">
          <table className="data-table w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Import errors</caption>
            <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody>
              {review.errors.map((error) => (
                <tr key={error.row} className="border-b last:border-0">
                  <td className="px-3 py-2">{error.row}</td>
                  <td className="px-3 py-2">{error.messages.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {review.decisions.length > 0 ? (
        <div className="overflow-x-auto surface">
          <table className="data-table w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Import preview</caption>
            <thead className="border-b bg-muted/40 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Record</th>
                <th className="px-3 py-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {review.decisions.map((decision) => (
                <tr key={`${decision.row}-${decision.label}`} className="border-b last:border-0">
                  <td className="px-3 py-2">{decision.row}</td>
                  <td className="px-3 py-2">
                    {decision.label}
                    <span className="text-muted-foreground"> · {decision.detail}</span>
                  </td>
                  <td className="px-3 py-2">
                    {decision.decision === "import" ? "Import" : "Skip"}
                    <span className="block text-muted-foreground">{decision.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function AcceptedValues({ kind }: { kind: ImportKind }) {
  const rows = kind === "companies"
    ? [
        ["Size", COMPANY_SIZES.join(", "), "unknown"],
        ["Research Status", RESEARCH_STATUSES.join(", "), "not_started"],
        ["Priority Tier", PRIORITY_TIERS.join(", "), "unset"],
      ]
    : [
        ["Work Arrangement", WORK_ARRANGEMENTS.join(", "), "unknown"],
        ["Employment Type", EMPLOYMENT_TYPES.join(", "), "unknown"],
        ["Status", APPLICATION_STATUSES.join(", "), "saved"],
        ["Salary Currency", "three uppercase letters, such as USD", "USD"],
      ]
  return (
    <section className="surface p-4">
      <h2 className="text-sm font-medium">Accepted values</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Empty optional cells use the default. Any other value is an error, and one error blocks the whole file.
        Existing records are skipped and are not overwritten.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2 pr-3 font-medium">Column</th>
              <th className="py-2 pr-3 font-medium">Exact values</th>
              <th className="py-2 font-medium">Default</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b last:border-0">
                <td className="py-2 pr-3">{row[0]}</td>
                <td className="py-2 pr-3">{row[1]}</td>
                <td className="py-2">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
