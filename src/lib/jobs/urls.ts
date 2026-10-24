export const APPROVED_SOURCE_HOSTS = new Set([
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.eu.lever.co",
  "api.ashbyhq.com",
])

export class SourceRequestError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "SourceRequestError"
  }
}

const IDENTIFIER = /^[A-Za-z0-9_-]{1,80}$/

export function assertSourceIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new SourceRequestError("invalid_identifier")
  return value
}

export function assertApprovedSourceUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new SourceRequestError("invalid_url")
  }
  if (parsed.protocol !== "https:") throw new SourceRequestError("invalid_protocol")
  if (parsed.username || parsed.password) throw new SourceRequestError("credentials_in_url")
  const host = parsed.hostname.toLowerCase()
  if (host !== parsed.hostname || !APPROVED_SOURCE_HOSTS.has(host)) {
    throw new SourceRequestError("unapproved_host")
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new SourceRequestError("unapproved_host")
  }
  return parsed
}

export const MAX_SOURCE_BYTES = 1_000_000

export function greenhouseJobsUrl(boardToken: string): string {
  const token = assertSourceIdentifier(boardToken)
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
}

export function leverPostingsUrl(site: string, region: "global" | "eu", skip: number): string {
  const token = assertSourceIdentifier(site)
  const host = region === "eu" ? "api.eu.lever.co" : "api.lever.co"
  const url = new URL(`https://${host}/v0/postings/${encodeURIComponent(token)}`)
  url.searchParams.set("mode", "json")
  url.searchParams.set("limit", "100")
  url.searchParams.set("skip", String(Math.max(0, skip)))
  return url.toString()
}

export function ashbyBoardUrl(boardName: string): string {
  const token = assertSourceIdentifier(boardName)
  const url = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`)
  url.searchParams.set("includeCompensation", "true")
  return url.toString()
}
