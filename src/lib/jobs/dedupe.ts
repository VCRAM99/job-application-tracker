import { normalizeJobUrl } from "@/lib/jobs/text"

export type DedupRow = {
  id: string
  sourceId: string
  sourceJobId: string
  title: string
  locationText: string | null
  employerDomain: string
  listingUrl: string
  applicationUrl: string | null
}

export type DedupDecision =
  | { action: "same_source"; matchId: string }
  | { action: "link"; matchId: string }
  | { action: "ambiguous"; matchId: string }
  | { action: "unique" }

function sameText(left: string | null, right: string | null): boolean {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase()
}

/**
 * Same-source ids are the primary key. Cross-provider links require the
 * canonical URL, employer domain, title, and location together.
 * A URL-and-title match without the other fields stays unlinked.
 */
export function classifyDuplicate(candidate: DedupRow, existing: readonly DedupRow[]): DedupDecision {
  const url = normalizeJobUrl(candidate.applicationUrl ?? candidate.listingUrl)
  const title = candidate.title.trim().toLowerCase()
  const domain = candidate.employerDomain.trim().toLowerCase()
  for (const row of existing) {
    if (row.id === candidate.id) continue
    if (row.sourceId === candidate.sourceId && row.sourceJobId === candidate.sourceJobId) {
      return { action: "same_source", matchId: row.id }
    }
    const rowUrl = normalizeJobUrl(row.applicationUrl ?? row.listingUrl)
    const sameUrl = Boolean(url && rowUrl && url === rowUrl)
    const sameTitle = title.length > 0 && title === row.title.trim().toLowerCase()
    const sameDomain =
      domain.length > 0 && domain === row.employerDomain.trim().toLowerCase() && domain !== ""
    const sameLocation = sameText(candidate.locationText, row.locationText)
    if (sameUrl && sameDomain && sameTitle && sameLocation) {
      return { action: "link", matchId: row.id }
    }
    if (sameUrl && sameTitle) {
      return { action: "ambiguous", matchId: row.id }
    }
  }
  return { action: "unique" }
}
