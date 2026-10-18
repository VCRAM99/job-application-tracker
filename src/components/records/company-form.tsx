"use client"

import Link from "next/link"
import { useActionState } from "react"

import { Field, FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  COMPANY_SIZES,
  COMPANY_SIZE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TIERS,
  RESEARCH_STATUSES,
  RESEARCH_STATUS_LABELS,
} from "@/lib/records/constants"
import { formText, initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"
import { companyFormSchema, fieldErrorsFrom } from "@/lib/records/schemas"

export type CompanyFormValues = {
  name: string
  size: string
  location: string
  industry: string
  researchStatus: string
  priorityTier: string
  reference: string
  websiteUrl: string
  notes: string
  followUpDate: string
}

export const emptyCompanyForm: CompanyFormValues = {
  name: "",
  size: "unknown",
  location: "",
  industry: "",
  researchStatus: "not_started",
  priorityTier: "unset",
  reference: "",
  websiteUrl: "",
  notes: "",
  followUpDate: "",
}

export function CompanyForm({
  action,
  values,
  id,
  submitLabel,
  cancelHref,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>
  values: CompanyFormValues
  id?: string
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const parsed = companyFormSchema.safeParse({
        name: formText(formData, "name"),
        size: formText(formData, "size"),
        location: formText(formData, "location"),
        industry: formText(formData, "industry"),
        researchStatus: formText(formData, "researchStatus"),
        priorityTier: formText(formData, "priorityTier"),
        reference: formText(formData, "reference"),
        websiteUrl: formText(formData, "websiteUrl"),
        notes: formText(formData, "notes"),
        followUpDate: formText(formData, "followUpDate"),
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
      <div className="sm:col-span-2">
        <Field name="name" label="Name" error={state.fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            aria-invalid={Boolean(state.fieldErrors.name)}
            aria-describedby={state.fieldErrors.name ? "name-error" : undefined}
          />
        </Field>
      </div>
      <Field name="size" label="Size" error={state.fieldErrors.size}>
        <NativeSelect id="size" name="size" defaultValue={values.size}>
          {COMPANY_SIZES.map((size) => (
            <option key={size} value={size}>
              {COMPANY_SIZE_LABELS[size]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="priorityTier" label="Priority" error={state.fieldErrors.priorityTier}>
        <NativeSelect id="priorityTier" name="priorityTier" defaultValue={values.priorityTier}>
          {PRIORITY_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {PRIORITY_LABELS[tier]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="researchStatus" label="Research status" error={state.fieldErrors.researchStatus}>
        <NativeSelect
          id="researchStatus"
          name="researchStatus"
          defaultValue={values.researchStatus}
        >
          {RESEARCH_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RESEARCH_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="location" label="Location" error={state.fieldErrors.location}>
        <Input id="location" name="location" defaultValue={values.location} />
      </Field>
      <Field name="industry" label="Industry" error={state.fieldErrors.industry}>
        <Input id="industry" name="industry" defaultValue={values.industry} />
      </Field>
      <Field name="reference" label="Reference" error={state.fieldErrors.reference}>
        <Input id="reference" name="reference" defaultValue={values.reference} />
      </Field>
      <Field name="websiteUrl" label="Website" error={state.fieldErrors.websiteUrl}>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={values.websiteUrl}
          aria-invalid={Boolean(state.fieldErrors.websiteUrl)}
          aria-describedby={state.fieldErrors.websiteUrl ? "websiteUrl-error" : undefined}
        />
      </Field>
      <Field name="followUpDate" label="Follow-up date" error={state.fieldErrors.followUpDate}>
        <Input
          id="followUpDate"
          name="followUpDate"
          type="date"
          defaultValue={values.followUpDate}
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
