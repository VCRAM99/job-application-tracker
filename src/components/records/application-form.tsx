"use client"

import Link from "next/link"
import { useActionState, useState } from "react"

import { Field, FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  WORK_ARRANGEMENTS,
  WORK_ARRANGEMENT_LABELS,
} from "@/lib/records/constants"
import { formText, initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"
import { applicationFormSchema, fieldErrorsFrom } from "@/lib/records/schemas"

export type ApplicationFormValues = {
  jobTitle: string
  jobUrl: string
  source: string
  location: string
  workArrangement: string
  employmentType: string
  salaryMin: string
  salaryMax: string
  salaryCurrency: string
  status: string
  appliedAt: string
  nextFollowUpDate: string
  notes: string
  companyMode: "existing" | "new"
  companyId: string
  newCompanyName: string
}

export const emptyApplicationForm: ApplicationFormValues = {
  jobTitle: "",
  jobUrl: "",
  source: "",
  location: "",
  workArrangement: "unknown",
  employmentType: "unknown",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  status: "saved",
  appliedAt: "",
  nextFollowUpDate: "",
  notes: "",
  companyMode: "existing",
  companyId: "",
  newCompanyName: "",
}

export function ApplicationForm({
  action,
  values,
  companies,
  id,
  submitLabel,
  cancelHref,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>
  values: ApplicationFormValues
  companies: Array<{ id: string; name: string }>
  id?: string
  submitLabel: string
  cancelHref: string
}) {
  const [companyMode, setCompanyMode] = useState<"existing" | "new">(
    companies.length === 0 ? "new" : values.companyMode,
  )
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const parsed = applicationFormSchema.safeParse({
        jobTitle: formText(formData, "jobTitle"),
        jobUrl: formText(formData, "jobUrl"),
        source: formText(formData, "source"),
        location: formText(formData, "location"),
        workArrangement: formText(formData, "workArrangement"),
        employmentType: formText(formData, "employmentType"),
        salaryMin: formText(formData, "salaryMin"),
        salaryMax: formText(formData, "salaryMax"),
        salaryCurrency: formText(formData, "salaryCurrency"),
        status: formText(formData, "status"),
        appliedAt: formText(formData, "appliedAt"),
        nextFollowUpDate: formText(formData, "nextFollowUpDate"),
        notes: formText(formData, "notes"),
        companyMode: formText(formData, "companyMode") || "existing",
        companyId: formText(formData, "companyId"),
        newCompanyName: formText(formData, "newCompanyName"),
      })
      if (!parsed.success) {
        return {
          status: "error" as const,
          message: "Check the form and try again.",
          fieldErrors: fieldErrorsFrom(parsed.error),
        }
      }
      return action(previous, formData)
    },
    initialRecordFormState,
  )

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2" noValidate>
      <FormStatus state={state} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="text-sm font-medium">Company</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="companyMode"
              value="existing"
              checked={companyMode === "existing"}
              onChange={() => setCompanyMode("existing")}
              disabled={companies.length === 0}
            />
            Existing company
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="companyMode"
              value="new"
              checked={companyMode === "new"}
              onChange={() => setCompanyMode("new")}
            />
            New company
          </label>
        </div>
        {companyMode === "existing" ? (
          <Field name="companyId" label="Company" error={state.fieldErrors.companyId}>
            <NativeSelect id="companyId" name="companyId" defaultValue={values.companyId}>
              <option value="">Choose a company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </NativeSelect>
            <input type="hidden" name="newCompanyName" value="" />
          </Field>
        ) : (
          <Field name="newCompanyName" label="New company name" error={state.fieldErrors.newCompanyName}>
            <Input
              id="newCompanyName"
              name="newCompanyName"
              defaultValue={values.newCompanyName}
              required
              aria-invalid={Boolean(state.fieldErrors.newCompanyName)}
              aria-describedby={
                state.fieldErrors.newCompanyName ? "newCompanyName-error" : undefined
              }
            />
            <input type="hidden" name="companyId" value="" />
          </Field>
        )}
      </fieldset>
      <div className="sm:col-span-2">
        <Field name="jobTitle" label="Job title" error={state.fieldErrors.jobTitle}>
          <Input
            id="jobTitle"
            name="jobTitle"
            defaultValue={values.jobTitle}
            required
            aria-invalid={Boolean(state.fieldErrors.jobTitle)}
            aria-describedby={state.fieldErrors.jobTitle ? "jobTitle-error" : undefined}
          />
        </Field>
      </div>
      <Field name="status" label="Status" error={state.fieldErrors.status}>
        <NativeSelect id="status" name="status" defaultValue={values.status}>
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="source" label="Source" error={state.fieldErrors.source}>
        <Input id="source" name="source" defaultValue={values.source} />
      </Field>
      <Field name="jobUrl" label="Job posting" error={state.fieldErrors.jobUrl}>
        <Input
          id="jobUrl"
          name="jobUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={values.jobUrl}
          aria-invalid={Boolean(state.fieldErrors.jobUrl)}
          aria-describedby={state.fieldErrors.jobUrl ? "jobUrl-error" : undefined}
        />
      </Field>
      <Field name="location" label="Location" error={state.fieldErrors.location}>
        <Input id="location" name="location" defaultValue={values.location} />
      </Field>
      <Field name="workArrangement" label="Work arrangement" error={state.fieldErrors.workArrangement}>
        <NativeSelect
          id="workArrangement"
          name="workArrangement"
          defaultValue={values.workArrangement}
        >
          {WORK_ARRANGEMENTS.map((value) => (
            <option key={value} value={value}>
              {WORK_ARRANGEMENT_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="employmentType" label="Employment type" error={state.fieldErrors.employmentType}>
        <NativeSelect id="employmentType" name="employmentType" defaultValue={values.employmentType}>
          {EMPLOYMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {EMPLOYMENT_TYPE_LABELS[value]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="salaryMin" label="Salary minimum" error={state.fieldErrors.salaryMin}>
        <Input id="salaryMin" name="salaryMin" inputMode="decimal" defaultValue={values.salaryMin} />
      </Field>
      <Field name="salaryMax" label="Salary maximum" error={state.fieldErrors.salaryMax}>
        <Input id="salaryMax" name="salaryMax" inputMode="decimal" defaultValue={values.salaryMax} />
      </Field>
      <Field name="salaryCurrency" label="Currency" error={state.fieldErrors.salaryCurrency}>
        <Input
          id="salaryCurrency"
          name="salaryCurrency"
          defaultValue={values.salaryCurrency}
          maxLength={3}
          aria-invalid={Boolean(state.fieldErrors.salaryCurrency)}
          aria-describedby={state.fieldErrors.salaryCurrency ? "salaryCurrency-error" : undefined}
        />
      </Field>
      <Field name="appliedAt" label="Applied date" error={state.fieldErrors.appliedAt}>
        <Input id="appliedAt" name="appliedAt" type="date" defaultValue={values.appliedAt} />
      </Field>
      <Field name="nextFollowUpDate" label="Follow-up date" error={state.fieldErrors.nextFollowUpDate}>
        <Input
          id="nextFollowUpDate"
          name="nextFollowUpDate"
          type="date"
          defaultValue={values.nextFollowUpDate}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field name="notes" label="Notes" error={state.fieldErrors.notes}>
          <Textarea id="notes" name="notes" defaultValue={values.notes} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button variant="outline" nativeButton={false} render={<Link href={cancelHref} />}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
