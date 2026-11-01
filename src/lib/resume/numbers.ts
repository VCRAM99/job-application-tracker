/**
 * Number claims in resume text, so a rewrite cannot introduce a metric,
 * count, amount, duration, or year that its sources do not contain.
 *
 * Each token keeps its kind: a currency amount must match a currency amount
 * in the same currency, a percentage must match a percentage, and a plain
 * number must match any token with the same value. Magnitude words and
 * suffixes are expanded ("$2M" and "$2 million" are both $2000000), and
 * number words count by value ("3" and "three" are the same claim).
 */
export type NumberToken =
  | { kind: "currency" | "percent" | "number"; value: number; currency?: string; unit?: string }
  | { kind: "word"; word: string }

const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
  twice: 2, double: 2, doubled: 2, triple: 3, tripled: 3, half: 50, halved: 50,
}

const SCALE: Record<string, number> = {
  k: 1_000, thousand: 1_000, lakh: 100_000, m: 1_000_000, mm: 1_000_000, million: 1_000_000, crore: 10_000_000,
  b: 1_000_000_000, bn: 1_000_000_000, billion: 1_000_000_000,
}

/** Vague quantity and rank words are claims too. They must appear in a source as written. */
const QUANTITY_WORDS = new Set([
  "hundreds", "thousands", "millions", "billions", "dozens", "decade", "decades", "first", "top", "record", "fastest", "largest", "biggest", "leading",
])

/** A unit right after a number. A rewritten number must keep the unit it had, so "40 engineers" cannot become "40ms" or "40x". */
const UNITS = new Set([
  "x", "ms", "s", "sec", "secs", "second", "seconds", "min", "mins", "minute", "minutes", "h", "hr", "hrs", "hour", "hours",
  "day", "days", "week", "weeks", "month", "months", "year", "years", "yr", "yrs", "bps", "rps", "qps", "tb", "gb", "mb", "kb",
  "engineer", "engineers", "people", "person", "user", "users", "customer", "customers", "client", "clients", "merchant", "merchants",
  "service", "services", "team", "teams", "member", "members", "developer", "developers", "report", "reports", "country", "countries",
  "language", "languages", "project", "projects", "product", "products", "transaction", "transactions", "request", "requests",
  "application", "applications", "app", "apps", "server", "servers", "repo", "repos", "repository", "repositories", "model", "models",
  "store", "stores", "site", "sites", "city", "cities", "office", "offices", "market", "markets", "partner", "partners", "account",
  "accounts", "ticket", "tickets", "incident", "incidents", "release", "releases", "deployment", "deployments", "hire", "hires",
  "intern", "interns", "student", "students", "patient", "patients", "employee", "employees", "region", "regions", "times", "fold",
])

const CURRENCY: Record<string, string> = {
  $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", usd: "USD", cad: "CAD", eur: "EUR", gbp: "GBP", inr: "INR",
}

const NUMBER = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`
const SCALE_WORDS = String.raw`(k|mm|m|bn|b|thousand|lakh|million|crore|billion)`
const PATTERNS: Array<{ kind: "currency" | "percent" | "number"; pattern: RegExp }> = [
  { kind: "currency", pattern: new RegExp(String.raw`([$€£¥₹])\s?(${NUMBER})\s?${SCALE_WORDS}?(?![a-z])`, "gi") },
  { kind: "currency", pattern: new RegExp(String.raw`\b(usd|cad|eur|gbp|inr)\s?(${NUMBER})\s?${SCALE_WORDS}?(?![a-z])`, "gi") },
  { kind: "percent", pattern: new RegExp(String.raw`(${NUMBER})\s?(%|percent\b|per\s?cent\b|pct\b)`, "gi") },
  { kind: "number", pattern: new RegExp(String.raw`(${NUMBER})\s?${SCALE_WORDS}(?![a-z])`, "gi") },
  { kind: "number", pattern: new RegExp(String.raw`(${NUMBER})`, "g") },
]

function numeric(value: string): number {
  return Number(value.replace(/,/g, ""))
}

/**
 * NFKC folds fullwidth digits; any other non-ASCII decimal digit is mapped to
 * ASCII by its Unicode digit value, so "٤٥%" reads as "45%".
 */
function asciiDigits(text: string): string {
  return text.normalize("NFKC").replace(/\p{Nd}/gu, (digit) => {
    if (digit >= "0" && digit <= "9") return digit
    const code = digit.codePointAt(0) as number
    for (let zero = code; zero > code - 10; zero -= 1) {
      if (!/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) return String((code - zero) % 10)
    }
    return "?"
  })
}

function unitAfter(text: string, end: number): string | undefined {
  const match = /^\s?([a-z]+)\b/i.exec(text.slice(end, end + 24))
  const word = match?.[1]?.toLowerCase()
  return word && UNITS.has(word) ? word.replace(/s$/, "") : undefined
}

export function numberTokens(input: string): NumberToken[] {
  const text = asciiDigits(input)
  let masked = text
  const tokens: NumberToken[] = []
  const take = (match: RegExpExecArray) => {
    masked = masked.slice(0, match.index) + " ".repeat(match[0].length) + masked.slice(match.index + match[0].length)
  }
  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0
    const matches = [...masked.matchAll(pattern)]
    for (const match of matches) {
      if (kind === "currency") {
        const symbol = (match[1] ?? "").toLowerCase()
        const scale = SCALE[(match[3] ?? "").toLowerCase()] ?? 1
        tokens.push({ kind, value: numeric(match[2] ?? "0") * scale, currency: CURRENCY[symbol] ?? symbol })
      } else if (kind === "percent") {
        tokens.push({ kind, value: numeric(match[1] ?? "0") })
      } else {
        const scale = SCALE[(match[2] ?? "").toLowerCase()] ?? 1
        tokens.push({ kind, value: numeric(match[1] ?? "0") * scale, unit: unitAfter(text, (match.index ?? 0) + match[0].length) })
      }
      take(match as RegExpExecArray)
    }
  }
  for (const match of masked.toLowerCase().matchAll(/#\s?1\b|\b[a-z]+\b/g)) {
    const word = match[0].replace(/\s/g, "")
    if (word in WORDS) {
      const value = WORDS[word] as number
      const unit = unitAfter(text, (match.index ?? 0) + match[0].length)
      tokens.push(word === "half" || word === "halved" ? { kind: "percent", value } : { kind: "number", value, unit })
    } else if (QUANTITY_WORDS.has(word) || word === "#1") {
      tokens.push({ kind: "word", word })
    }
  }
  return tokens
}

function allows(allowed: NumberToken[], token: NumberToken): boolean {
  if (token.kind === "word") return allowed.some((candidate) => candidate.kind === "word" && candidate.word === token.word)
  return allowed.some((candidate) => {
    if (candidate.kind === "word" || candidate.value !== token.value) return false
    if (token.kind === "number") {
      // A bare number may echo any source number of that value; a number with a unit must keep the unit.
      return !token.unit || (candidate.kind === "number" && candidate.unit === token.unit)
    }
    if (token.kind !== candidate.kind) return false
    return token.kind !== "currency" || candidate.currency === token.currency
  })
}

/** Number claims in `after` that no source text contains. Empty means the rewrite adds no numbers. */
export function newNumbers(after: string, sources: string[]): NumberToken[] {
  const allowed = sources.flatMap(numberTokens)
  return numberTokens(after).filter((token) => !allows(allowed, token))
}
