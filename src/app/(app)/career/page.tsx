import type { Metadata } from "next"

import {
  ExtractForm,
  FactList,
  ManualFactForm,
  ProfileForm,
  SourceForm,
  SuggestedFactCard,
  SuggestionCard,
} from "@/components/career/forms"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  acceptCareerSuggestion,
  addManualFact,
  createCareerSource,
  extractCareerFacts,
  rejectCareerSuggestion,
  reviewSuggestedFact,
  saveCareerProfile,
  supersedeCareerFact,
} from "@/lib/career/actions"
import { loadCareer, type CareerWorkspace } from "@/lib/career/data"

export const metadata: Metadata = { title: "Career" }

export default async function CareerPage() {
  const loaded = await loadCareer()

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Career profile"
        description="Verified career facts stay separate from AI suggestions. A pasted source is text for review, not an exported resume file."
      />
      {loaded.state === "disabled" ? (
        <RecordState
          title="Career tools are off"
          description="Set AI_FEATURES_ENABLED=true on the server to use the career profile. Existing job tracking is unchanged."
        />
      ) : null}
      {loaded.state === "missing_table" ? (
        <RecordState
          title="Career tables are not installed"
          description="Apply the career knowledge migration to a non-production database before using this page. The rest of the app keeps working."
        />
      ) : null}
      {loaded.state === "unavailable" ? (
        <RecordState
          title="Career profile is unavailable"
          description="The career data could not be loaded. Try again after the database is reachable."
        />
      ) : null}
      {loaded.state === "ready" ? <Workspace workspace={loaded.workspace} /> : null}
    </div>
  )
}

function Workspace({ workspace }: { workspace: CareerWorkspace }) {
  const pending = workspace.suggestions.filter((item) => item.status === "pending")
  const rejected = workspace.suggestions.filter((item) => item.status === "rejected")
  const suggestedFacts = workspace.facts.filter((fact) => fact.verificationState === "suggested")
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Summary and preferences</CardTitle>
          <CardDescription>Target roles and work preferences belong to this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            action={saveCareerProfile}
            summary={workspace.profile.summary}
            targetRoles={workspace.profile.targetRoles}
            countries={workspace.profile.countries}
            arrangements={workspace.profile.workArrangements}
            salaryFloor={workspace.profile.salaryFloor}
            salaryCurrency={workspace.profile.salaryCurrency}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Resume text sources</CardTitle>
          <CardDescription>
            Save more than one source. Extraction uses the provider and model saved in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <SourceForm action={createCareerSource} />
          {workspace.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sources yet.</p>
          ) : (
            workspace.sources.map((source) => (
              <div key={source.id} className="grid gap-3">
                <ExtractForm action={extractCareerFacts} source={source} settings={workspace.settings} />
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                  {source.body}
                </pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card id="suggestions">
        <CardHeader>
          <CardTitle>Suggestions</CardTitle>
          <CardDescription>
            Accepting one suggestion verifies only that item. Rejected items stay rejected. Facts saved from a fit analysis start here as suggested.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {suggestedFacts.map((fact) => (
            <SuggestedFactCard key={fact.id} fact={fact} action={reviewSuggestedFact} />
          ))}
          {pending.length === 0 && suggestedFacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suggestions waiting for review.</p>
          ) : null}
          {pending.length === 0 ? null : (
            pending.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                accept={acceptCareerSuggestion}
                reject={rejectCareerSuggestion}
              />
            ))
          )}
          {rejected.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm">Rejected ({rejected.length})</summary>
              <ul className="mt-2 grid gap-2 text-sm text-muted-foreground">
                {rejected.map((item) => (
                  <li key={item.id}>{String(item.payload.title ?? item.payload.name ?? item.payload.credential ?? item.factType)}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Verified facts</CardTitle>
          <CardDescription>Verified records stay unchanged until you supersede them.</CardDescription>
        </CardHeader>
        <CardContent>
          <FactList facts={workspace.facts} sources={workspace.sources} supersede={supersedeCareerFact} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add a verified fact</CardTitle>
          <CardDescription>Manual entries are verified because you typed them.</CardDescription>
        </CardHeader>
        <CardContent>
          <ManualFactForm action={addManualFact} />
        </CardContent>
      </Card>
    </div>
  )
}
