const STOP = new Set(["and", "the", "for", "with", "role", "job", "a", "to", "of"])

/** ASCII tokens shared with public.job_text_tokens. Accent folding is applied before the split. */
export function textTokens(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
  const unique = new Set<string>()
  for (const token of normalized.split(/[^a-z0-9+#]+/)) {
    if (token.length > 1 && !STOP.has(token)) unique.add(token)
  }
  return [...unique].sort()
}

export function normalizeEmployerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export function normalizeJobUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    const path = parsed.pathname.replace(/\/$/, "") || "/"
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`
  } catch {
    return null
  }
}
