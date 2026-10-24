"use client"

import { useActionState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { initialJobActionState, type JobActionState } from "@/lib/jobs/action-state"
import {
  ARRANGEMENT_OPTIONS,
  EMPLOYMENT_OPTIONS,
  SENIORITY_OPTIONS,
  type JobSearchState,
} from "@/lib/jobs/query"
import { NativeSelect } from "@/components/records/fields"
import { indeedSearchUrl, linkedInSearchUrl } from "@/lib/jobs/external-search"

const ARRANGEMENT_LABEL = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }
const EMPLOYMENT_LABEL = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
}
const SENIORITY_LABEL = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
  manager: "Manager",
}

export function JobSearchForm({
  state,
  savePreferences,
  saveNamedSearch,
}: {
  state: JobSearchState
  savePreferences: (previous: JobActionState, formData: FormData) => Promise<JobActionState>
  saveNamedSearch: (previous: JobActionState, formData: FormData) => Promise<JobActionState>
}) {
  const [saved, saveAction, pending] = useActionState(savePreferences, initialJobActionState)
  const [named, saveNamedAction, naming] = useActionState(saveNamedSearch, initialJobActionState)
  const external = {
    keywords: state.keywords,
    location: state.locations.join(", "),
    country: state.countries.length === 1 ? state.countries[0] ?? "" : "",
    workArrangement: state.workArrangements.length === 1 ? state.workArrangements[0] ?? "" : "",
  }

  return (
    <div className="space-y-4">
      <form id="job-search" method="get" className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="applied" value="1" />
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">Role, company, or keyword</span>
          <Input name="q" defaultValue={state.keywords} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Location</span>
          <Input name="location" defaultValue={state.locations.join(", ")} placeholder="Toronto, Austin" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Sort</span>
          <NativeSelect name="sort" defaultValue={state.sort}>
            <option value="relevance">Relevance</option>
            <option value="recency">Recency</option>
            <option value="company">Company</option>
          </NativeSelect>
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Country</legend>
          {["CA", "US"].map((country) => (
            <label key={country} className="flex items-center gap-2">
              <input type="checkbox" name="country" value={country} defaultChecked={state.countries.includes(country)} />
              {country === "CA" ? "Canada" : "United States"}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Work arrangement</legend>
          {ARRANGEMENT_OPTIONS.map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="arrangement"
                value={value}
                defaultChecked={state.workArrangements.includes(value)}
              />
              {ARRANGEMENT_LABEL[value]}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Seniority</legend>
          {SENIORITY_OPTIONS.map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="seniority"
                value={value}
                defaultChecked={state.seniorities.includes(value)}
              />
              {SENIORITY_LABEL[value]}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Employment type</legend>
          {EMPLOYMENT_OPTIONS.map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="employment"
                value={value}
                defaultChecked={state.employmentTypes.includes(value)}
              />
              {EMPLOYMENT_LABEL[value]}
            </label>
          ))}
        </fieldset>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Salary minimum</span>
          <Input name="salary" inputMode="decimal" defaultValue={state.salaryMin} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Currency</span>
          <Input name="currency" defaultValue={state.salaryCurrency} maxLength={3} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Posted within</span>
          <NativeSelect name="posted" defaultValue={state.postedWithinDays}>
            <option value="">Any date</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </NativeSelect>
        </label>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="easyApply" value="1" defaultChecked={state.excludeEasyApply} />
            Exclude LinkedIn Easy Apply
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="hideUnknownSalary" value="on" defaultChecked={!state.includeUnknownCompensation} />
            Hide unknown compensation
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="preferred" value="1" defaultChecked={state.preferredOnly} />
            Preferred companies only
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="saved" value="1" defaultChecked={state.savedOnly} />
            Saved jobs
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="hidden" value="1" defaultChecked={state.includeHidden} />
            Include hidden jobs
          </label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Search</Button>
          <Button type="submit" variant="outline" form="job-preferences" disabled={pending}>
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </div>
        {saved.message ? (
          <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4" role="status">
            {saved.message}
          </p>
        ) : null}
      </form>
      <form
        id="job-preferences"
        action={saveAction}
        className="hidden"
        onSubmit={(event) => {
          const search = document.getElementById("job-search")
          if (!(search instanceof HTMLFormElement)) return
          for (const field of event.currentTarget.querySelectorAll("[data-copied-search]")) field.remove()
          for (const [key, value] of new FormData(search).entries()) {
            const input = document.createElement("input")
            input.type = "hidden"
            input.name = key
            input.value = String(value)
            input.dataset.copiedSearch = "true"
            event.currentTarget.append(input)
          }
        }}
      />
      <form action={saveNamedAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium">Save this search</span>
          <Input name="name" placeholder="Backend, Canada, remote" required maxLength={80} />
          <input type="hidden" name="q" value={state.keywords} />
          <input type="hidden" name="location" value={state.locations.join(", ")} />
          <input type="hidden" name="salary" value={state.salaryMin} />
          <input type="hidden" name="currency" value={state.salaryCurrency} />
          <input type="hidden" name="posted" value={state.postedWithinDays} />
          {state.countries.map((country) => (
            <input key={country} type="hidden" name="country" value={country} />
          ))}
          {state.workArrangements.map((value) => (
            <input key={value} type="hidden" name="arrangement" value={value} />
          ))}
          {state.seniorities.map((value) => (
            <input key={value} type="hidden" name="seniority" value={value} />
          ))}
          {state.employmentTypes.map((value) => (
            <input key={value} type="hidden" name="employment" value={value} />
          ))}
          {state.excludeEasyApply ? <input type="hidden" name="easyApply" value="1" /> : null}
          {!state.includeUnknownCompensation ? <input type="hidden" name="hideUnknownSalary" value="on" /> : null}
        </label>
        <Button type="submit" variant="outline" disabled={naming}>
          {naming ? "Saving…" : "Save search"}
        </Button>
      </form>
      {named.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {named.message}
        </p>
      ) : null}
      <div className="rounded-xl bg-muted/40 p-4 text-sm">
        <p className="font-medium">Search outside the catalog</p>
        <p className="mt-1 text-muted-foreground">
          LinkedIn and Indeed open as external searches. Those results are not indexed jobs, and Easy Apply is only
          excluded inside this catalog when the application method is identified.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={linkedInSearchUrl(external)} target="_blank" rel="noopener noreferrer" />}>
            Search LinkedIn
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={indeedSearchUrl(external)} target="_blank" rel="noopener noreferrer" />}>
            Search Indeed
          </Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/applications/new?source=linkedin" />}>
            Add a role you found
          </Button>
        </div>
      </div>
    </div>
  )
}
