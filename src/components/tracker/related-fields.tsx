"use client"

import { useState } from "react"

import { Field, NativeSelect } from "@/components/records/fields"
import type { ApplicationOption } from "@/lib/records/tracker"

export function RelatedFields({
  companies,
  applications,
  companyId,
  applicationId,
  companyError,
  applicationError,
}: {
  companies: Array<{ id: string; name: string }>
  applications: ApplicationOption[]
  companyId: string
  applicationId: string
  companyError?: string
  applicationError?: string
}) {
  const [company, setCompany] = useState(companyId)
  const [application, setApplication] = useState(applicationId)
  const visible = company
    ? applications.filter((item) => item.companyId === company)
    : applications

  return (
    <>
      <Field name="companyId" label="Company" error={companyError}>
        <NativeSelect
          id="companyId"
          name="companyId"
          value={company}
          onChange={(event) => {
            const next = event.target.value
            setCompany(next)
            if (application && !applications.some((item) => item.id === application && (!next || item.companyId === next))) {
              setApplication("")
            }
          }}
        >
          <option value="">None</option>
          {companies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="applicationId" label="Application" error={applicationError}>
        <NativeSelect
          id="applicationId"
          name="applicationId"
          value={application}
          onChange={(event) => {
            const next = event.target.value
            setApplication(next)
            const match = applications.find((item) => item.id === next)
            if (match) setCompany(match.companyId)
          }}
        >
          <option value="">None</option>
          {visible.map((item) => (
            <option key={item.id} value={item.id}>
              {item.jobTitle} — {item.companyName}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  )
}
