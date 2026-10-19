"use client"

import Link from "next/link"
import { useActionState } from "react"

import { Field, FormStatus, NativeSelect } from "@/components/records/fields"
import { RelatedFields } from "@/components/tracker/related-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  OUTREACH_LABELS,
  OUTREACH_STATUSES,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TYPES,
} from "@/lib/records/constants"
import { formText, initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"
import { contactFormSchema, fieldErrorsFrom } from "@/lib/records/schemas"
import type { ApplicationOption } from "@/lib/records/tracker"

export type ContactFormValues = {
  name: string
  roleTitle: string
  organization: string
  email: string
  linkedinUrl: string
  companyId: string
  applicationId: string
  relationshipType: string
  outreachStatus: string
  lastContactedAt: string
  nextFollowUpDate: string
  notes: string
}

export const emptyContactForm: ContactFormValues = {
  name: "",
  roleTitle: "",
  organization: "",
  email: "",
  linkedinUrl: "",
  companyId: "",
  applicationId: "",
  relationshipType: "other",
  outreachStatus: "not_contacted",
  lastContactedAt: "",
  nextFollowUpDate: "",
  notes: "",
}

export function ContactForm({
  action,
  values,
  companies,
  applications,
  id,
  submitLabel,
  cancelHref,
}: {
  action: (state: RecordFormState, formData: FormData) => Promise<RecordFormState>
  values: ContactFormValues
  companies: Array<{ id: string; name: string }>
  applications: ApplicationOption[]
  id?: string
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: RecordFormState, formData: FormData) => {
      const parsed = contactFormSchema.safeParse({
        name: formText(formData, "name"),
        roleTitle: formText(formData, "roleTitle"),
        organization: formText(formData, "organization"),
        email: formText(formData, "email"),
        linkedinUrl: formText(formData, "linkedinUrl"),
        companyId: formText(formData, "companyId"),
        applicationId: formText(formData, "applicationId"),
        relationshipType: formText(formData, "relationshipType"),
        outreachStatus: formText(formData, "outreachStatus"),
        lastContactedAt: formText(formData, "lastContactedAt"),
        nextFollowUpDate: formText(formData, "nextFollowUpDate"),
        notes: formText(formData, "notes"),
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
          <Input id="name" name="name" defaultValue={values.name} required aria-invalid={Boolean(state.fieldErrors.name)} aria-describedby={state.fieldErrors.name ? "name-error" : undefined} />
        </Field>
      </div>
      <Field name="roleTitle" label="Role" error={state.fieldErrors.roleTitle}>
        <Input id="roleTitle" name="roleTitle" defaultValue={values.roleTitle} />
      </Field>
      <Field name="organization" label="Organization" error={state.fieldErrors.organization}>
        <Input id="organization" name="organization" defaultValue={values.organization} />
      </Field>
      <Field name="email" label="Email" error={state.fieldErrors.email}>
        <Input id="email" name="email" type="email" defaultValue={values.email} aria-invalid={Boolean(state.fieldErrors.email)} aria-describedby={state.fieldErrors.email ? "email-error" : undefined} />
      </Field>
      <Field name="linkedinUrl" label="LinkedIn" error={state.fieldErrors.linkedinUrl}>
        <Input id="linkedinUrl" name="linkedinUrl" type="url" placeholder="https://" defaultValue={values.linkedinUrl} aria-invalid={Boolean(state.fieldErrors.linkedinUrl)} aria-describedby={state.fieldErrors.linkedinUrl ? "linkedinUrl-error" : undefined} />
      </Field>
      <RelatedFields
        companies={companies}
        applications={applications}
        companyId={values.companyId}
        applicationId={values.applicationId}
        companyError={state.fieldErrors.companyId}
        applicationError={state.fieldErrors.applicationId}
      />
      <Field name="relationshipType" label="Relationship" error={state.fieldErrors.relationshipType}>
        <NativeSelect id="relationshipType" name="relationshipType" defaultValue={values.relationshipType}>
          {RELATIONSHIP_TYPES.map((value) => (
            <option key={value} value={value}>{RELATIONSHIP_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="outreachStatus" label="Outreach" error={state.fieldErrors.outreachStatus}>
        <NativeSelect id="outreachStatus" name="outreachStatus" defaultValue={values.outreachStatus}>
          {OUTREACH_STATUSES.map((value) => (
            <option key={value} value={value}>{OUTREACH_LABELS[value]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="lastContactedAt" label="Last contacted" error={state.fieldErrors.lastContactedAt}>
        <Input id="lastContactedAt" name="lastContactedAt" type="date" defaultValue={values.lastContactedAt} />
      </Field>
      <Field name="nextFollowUpDate" label="Follow-up date" error={state.fieldErrors.nextFollowUpDate}>
        <Input id="nextFollowUpDate" name="nextFollowUpDate" type="date" defaultValue={values.nextFollowUpDate} />
      </Field>
      <div className="sm:col-span-2">
        <Field name="notes" label="Notes" error={state.fieldErrors.notes}>
          <Textarea id="notes" name="notes" defaultValue={values.notes} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        <Button variant="outline" nativeButton={false} render={<Link href={cancelHref} />}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  )
}
