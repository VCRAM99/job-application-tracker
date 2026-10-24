"use client"

import { useActionState } from "react"

import { FACT_LABELS } from "@/lib/career/constants"
import type { CareerFact, CareerSource, CareerSuggestionView, AiSettingsView } from "@/lib/career/data"
import { FACT_TYPES, type FactType } from "@/lib/ai/extraction"
import { modelsFor } from "@/lib/ai/models"
import { PROVIDERS, type ProviderId } from "@/lib/ai/types"
import { Field, FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"

type Action = (state: RecordFormState, formData: FormData) => Promise<RecordFormState>

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
}

export function ProfileForm({
  action,
  summary,
  targetRoles,
  countries,
  arrangements,
  salaryFloor,
  salaryCurrency,
}: {
  action: Action
  summary: string
  targetRoles: string[]
  countries: string[]
  arrangements: string[]
  salaryFloor: number | null
  salaryCurrency: string
}) {
  const [state, formAction, pending] = useActionState(action, initialRecordFormState)
  return (
    <form action={formAction} className="grid gap-4">
      <FormStatus state={state} />
      <Field name="summary" label="Professional summary">
        <Textarea id="summary" name="summary" defaultValue={summary} rows={4} />
      </Field>
      <Field name="targetRoles" label="Target roles">
        <Input id="targetRoles" name="targetRoles" defaultValue={targetRoles.join(", ")} placeholder="Software engineer, ML engineer" />
      </Field>
      <Field name="countries" label="Countries">
        <Input id="countries" name="countries" defaultValue={countries.join(", ")} placeholder="CA, US" />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Work arrangements</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remote" defaultChecked={arrangements.includes("remote")} /> Remote</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hybrid" defaultChecked={arrangements.includes("hybrid")} /> Hybrid</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onsite" defaultChecked={arrangements.includes("onsite")} /> On-site</label>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="salaryFloor" label="Salary floor">
          <Input id="salaryFloor" name="salaryFloor" inputMode="decimal" defaultValue={salaryFloor ?? ""} />
        </Field>
        <Field name="salaryCurrency" label="Currency">
          <Input id="salaryCurrency" name="salaryCurrency" defaultValue={salaryCurrency} maxLength={3} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>Save profile</Button>
    </form>
  )
}

export function SourceForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialRecordFormState)
  return (
    <form action={formAction} className="grid gap-4">
      <FormStatus state={state} />
      <Field name="label" label="Source name">
        <Input id="label" name="label" placeholder="General resume" />
      </Field>
      <Field name="body" label="Resume text">
        <Textarea id="body" name="body" rows={8} placeholder="Paste resume text. This is not a DOCX or PDF export." />
      </Field>
      <Button type="submit" disabled={pending}>Save source</Button>
    </form>
  )
}

export function ExtractForm({
  action,
  source,
  settings,
}: {
  action: Action
  source: CareerSource
  settings: AiSettingsView
}) {
  const [state, formAction, pending] = useActionState(action, initialRecordFormState)
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3">
      <div>
        <p className="font-medium">{source.label}</p>
        <p className="text-sm text-muted-foreground">
          {settings.provider ? PROVIDER_LABELS[settings.provider] : "No provider"} · {settings.model ?? "No model"} ·{" "}
          {settings.executionMode === "managed" ? "Managed AI" : "Bring your own key"}
        </p>
      </div>
      <FormStatus state={state} />
      <input type="hidden" name="sourceId" value={source.id} />
      <input type="hidden" name="executionMode" value={settings.executionMode} />
      <Button type="submit" variant="outline" disabled={pending || !settings.provider || !settings.model}>
        Extract suggestions
      </Button>
    </form>
  )
}

export function SuggestionCard({
  suggestion,
  accept,
  reject,
}: {
  suggestion: CareerSuggestionView
  accept: Action
  reject: (formData: FormData) => Promise<void>
}) {
  const [state, formAction, pending] = useActionState(accept, initialRecordFormState)
  const payload = suggestion.payload
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{FACT_LABELS[suggestion.factType]}</p>
        <p className="text-xs text-muted-foreground">{suggestion.status}</p>
      </div>
      <FormStatus state={state} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <input type="hidden" name="factType" value={suggestion.factType} />
      <FactFields idPrefix={suggestion.id} factType={suggestion.factType} payload={payload} evidence={suggestion.evidence} />
      {suggestion.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>Accept</Button>
          <Button type="submit" variant="outline" formAction={reject}>
            Reject
          </Button>
        </div>
      ) : null}
    </form>
  )
}

export function ManualFactForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialRecordFormState)
  return (
    <form action={formAction} className="grid gap-4">
      <FormStatus state={state} />
      <Field name="factType" label="Type">
        <NativeSelect id="factType" name="factType" defaultValue="employment">
          {FACT_TYPES.map((type) => (
            <option key={type} value={type}>{FACT_LABELS[type]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field name="primary" label="Title or name">
        <Input id="primary" name="primary" />
      </Field>
      <Field name="secondary" label="Organization, school, or issuer">
        <Input id="secondary" name="secondary" />
      </Field>
      <Field name="summary" label="Details">
        <Textarea id="manual-summary" name="summary" rows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="startDate" label="Start or issued date">
          <Input id="startDate" name="startDate" placeholder="YYYY-MM-DD" />
        </Field>
        <Field name="endDate" label="End date">
          <Input id="endDate" name="endDate" placeholder="YYYY-MM-DD" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="current" /> Current role</label>
      <Field name="url" label="URL">
        <Input id="url" name="url" placeholder="https://" />
      </Field>
      <Button type="submit" disabled={pending}>Add verified fact</Button>
    </form>
  )
}

export function SuggestedFactCard({
  fact,
  action,
}: {
  fact: CareerFact
  action: Action
}) {
  const [state, formAction, pending] = useActionState(action, initialRecordFormState)
  return (
    <form action={formAction} id={`fact-${fact.id}`} className="grid gap-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{FACT_LABELS[fact.factType]} · Suggested</p>
      <p className="text-sm text-muted-foreground">This stays unverified until you accept it.</p>
      <FormStatus state={state} />
      <input type="hidden" name="factId" value={fact.id} />
      <input type="hidden" name="factTable" value={fact.factTable} />
      <input type="hidden" name="factType" value={fact.factType} />
      <Field name={`primary-${fact.id}`} label="Title or name">
        <Input id={`primary-${fact.id}`} name="primary" defaultValue={fact.title} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="accept" disabled={pending}>Accept and verify</Button>
        <Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>Reject</Button>
      </div>
    </form>
  )
}

export function FactList({
  facts,
  sources,
  supersede,
}: {
  facts: CareerFact[]
  sources: CareerSource[]
  supersede: (formData: FormData) => Promise<void>
}) {
  const active = facts.filter((fact) => fact.verificationState === "user_verified")
  const history = facts.filter((fact) => fact.verificationState === "superseded")
  return (
    <div className="grid gap-4">
      {active.length === 0 ? <p className="text-sm text-muted-foreground">No verified facts yet.</p> : null}
      {active.map((fact) => (
        <article key={fact.id} id={`fact-${fact.id}`} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{FACT_LABELS[fact.factType]} · Verified</p>
          <h3 className="font-medium">{fact.title}</h3>
          <p className="text-sm text-muted-foreground">{fact.detail}</p>
          <p className="mt-2 text-sm">{fact.evidence ? `Evidence: ${fact.evidence}` : "Added manually."}</p>
          <p className="text-xs text-muted-foreground">
            Source: {sources.find((source) => source.id === fact.sourceId)?.label ?? "Manual entry"}
          </p>
          <form action={supersede} className="mt-3">
            <input type="hidden" name="factId" value={fact.id} />
            <input type="hidden" name="factTable" value={fact.factTable} />
            <Button type="submit" variant="outline">Supersede</Button>
          </form>
        </article>
      ))}
      {history.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm">Superseded history ({history.length})</summary>
          <ul className="mt-2 grid gap-2 text-sm text-muted-foreground">
            {history.map((fact) => (
              <li key={fact.id}>{fact.title} · {fact.detail}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export function AiSettingsForm({
  action,
  credentialAction,
  revoke,
  settings,
  credentials,
  usage,
  encryptionReady,
  managedReady,
}: {
  action: Action
  credentialAction: Action
  revoke: (formData: FormData) => Promise<void>
  settings: AiSettingsView
  credentials: Array<{ id: string; provider: ProviderId; lastFour: string; status: string }>
  usage: { requests: number; tokens: number; policyEnabled: boolean; requestLimit: number; tokenLimit: number }
  encryptionReady: boolean
  managedReady: boolean
}) {
  const [state, formAction, pending] = useActionState(action, initialRecordFormState)
  const [credentialState, credentialFormAction, credentialPending] = useActionState(
    credentialAction,
    initialRecordFormState,
  )
  const provider = settings.provider ?? "openai"
  return (
    <div className="grid gap-8">
      <form action={formAction} className="grid gap-4">
        <FormStatus state={state} />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Execution mode</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="executionMode" value="byok" defaultChecked={settings.executionMode !== "managed"} />
            Bring your own key
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="executionMode" value="managed" defaultChecked={settings.executionMode === "managed"} />
            Managed AI
          </label>
          <p className="text-sm text-muted-foreground">Local desktop execution is not available in this version.</p>
        </fieldset>
        <Field name="provider" label="Provider">
          <NativeSelect id="provider" name="provider" defaultValue={provider}>
            {PROVIDERS.map((item) => (
              <option key={item} value={item}>{PROVIDER_LABELS[item]}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field name="model" label="Model">
          <NativeSelect id="model" name="model" defaultValue={settings.model ?? modelsFor(provider)[0]?.id}>
            {PROVIDERS.flatMap((item) =>
              modelsFor(item).map((model) => (
                <option key={model.id} value={model.id}>{PROVIDER_LABELS[item]} · {model.label}</option>
              )),
            )}
          </NativeSelect>
        </Field>
        <p className="text-sm text-muted-foreground">
          Managed allowance: {managedReady && usage.policyEnabled ? `${usage.requestLimit} requests and ${usage.tokenLimit} tokens this month` : "not configured"}.
          Used this month: {usage.requests} requests, {usage.tokens} tokens.
          Estimates in dollars are omitted until a rate table is configured.
        </p>
        <Button type="submit" disabled={pending}>Save AI settings</Button>
      </form>
      <form action={credentialFormAction} className="grid gap-4">
        <FormStatus state={credentialState} />
        <Field name="credentialProvider" label="Key provider">
          <NativeSelect id="credentialProvider" name="provider" defaultValue={provider}>
            {PROVIDERS.map((item) => (
              <option key={item} value={item}>{PROVIDER_LABELS[item]}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field name="secret" label="API key">
          <Input id="secret" name="secret" type="password" autoComplete="off" placeholder="Paste a new key" />
        </Field>
        <p className="text-sm text-muted-foreground">
          {encryptionReady
            ? "Saved keys stay encrypted. The full key is not shown again. Saving a key does not mark the provider as connected."
            : "Set AI_CREDENTIALS_KEY on the server before saving a key."}
        </p>
        <Button type="submit" variant="outline" disabled={credentialPending || !encryptionReady}>Save key</Button>
      </form>
      <ul className="grid gap-2">
        {credentials.length === 0 ? <li className="text-sm text-muted-foreground">No keys saved.</li> : null}
        {credentials.map((credential) => (
          <li key={credential.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <span>
              {PROVIDER_LABELS[credential.provider]} ····{credential.lastFour} · {statusLabel(credential.status)}
            </span>
            {credential.status === "unverified" ? (
              <form action={revoke}>
                <input type="hidden" name="credentialId" value={credential.id} />
                <Button type="submit" variant="outline">Revoke</Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === "unverified") return "Unverified"
  if (status === "verified") return "Verified"
  if (status === "invalid") return "Invalid"
  if (status === "revoked") return "Revoked"
  return "Unconfigured"
}

function FactFields({
  idPrefix,
  factType,
  payload,
  evidence,
}: {
  idPrefix: string
  factType: FactType
  payload: Record<string, unknown>
  evidence: string | null
}) {
  const text = (key: string) => (typeof payload[key] === "string" ? payload[key] : "")
  return (
    <>
      <label className="grid gap-2 text-sm" data-fact-type={factType}>
        Title or name
        <Input id={`${idPrefix}-primary`} name="primary" defaultValue={text("title") || text("name") || text("credential")} />
      </label>
      <label className="grid gap-2 text-sm">
        Organization, school, or issuer
        <Input id={`${idPrefix}-secondary`} name="secondary" defaultValue={text("organization") || text("institution") || text("issuer") || text("category") || text("roleTitle")} />
      </label>
      <label className="grid gap-2 text-sm">
        Details
        <Textarea id={`${idPrefix}-summary`} name="summary" defaultValue={text("summary") || text("fieldOfStudy")} rows={3} />
      </label>
      <label className="grid gap-2 text-sm">
        Evidence from the source
        <Textarea id={`${idPrefix}-evidence`} name="evidence" defaultValue={evidence ?? text("evidence")} rows={2} />
      </label>
      <input type="hidden" name="startDate" value={text("startDate") || text("issuedOn")} />
      <input type="hidden" name="endDate" value={text("endDate") || text("expiresOn")} />
      <input type="hidden" name="url" value={text("url") || text("credentialUrl")} />
      {payload.current === true ? <input type="hidden" name="current" value="on" /> : null}
      {payload.location ? <input type="hidden" name="location" value={text("location")} /> : null}
    </>
  )
}
