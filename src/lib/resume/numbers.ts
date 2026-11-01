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
export type NumberToken = { kind: "currency" | "percent" | "number"; value: number; currency?: string }

const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
  twice: 2, double: 2, doubled: 2, triple: 3, tripled: 3, half: 50, halved: 50,
}

const SCALE: Record<string, number> = {
  k: 1_000, thousand: 1_000, m: 1_000_000, mm: 1_000_000, million: 1_000_000, b: 1_000_000_000, bn: 1_000_000_000, billion: 1_000_000_000,
}

const CURRENCY: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", usd: "USD", cad: "CAD", eur: "EUR", gbp: "GBP" }

const NUMBER = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`
const SCALE_WORDS = String.raw`(k|mm|m|bn|b|thousand|million|billion)`
const PATTERNS: Array<{ kind: NumberToken["kind"]; pattern: RegExp }> = [
  { kind: "currency", pattern: new RegExp(String.raw`([$€£¥])\s?(${NUMBER})\s?${SCALE_WORDS}?(?![a-z])`, "gi") },
  { kind: "currency", pattern: new RegExp(String.raw`\b(usd|cad|eur|gbp)\s?(${NUMBER})\s?${SCALE_WORDS}?(?![a-z])`, "gi") },
  { kind: "percent", pattern: new RegExp(String.raw`(${NUMBER})\s?(%|percent\b|pct\b)`, "gi") },
  { kind: "number", pattern: new RegExp(String.raw`(${NUMBER})\s?${SCALE_WORDS}(?![a-z])`, "gi") },
  { kind: "number", pattern: new RegExp(String.raw`(${NUMBER})`, "g") },
]

function numeric(value: string): number {
  return Number(value.replace(/,/g, ""))
}

export function numberTokens(text: string): NumberToken[] {
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
        tokens.push({ kind, value: numeric(match[1] ?? "0") * scale })
      }
      take(match as RegExpExecArray)
    }
  }
  for (const match of masked.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const word = match[0]
    if (word in WORDS) {
      const value = WORDS[word] as number
      tokens.push(word === "half" || word === "halved" ? { kind: "percent", value } : { kind: "number", value })
    }
  }
  return tokens
}

function allows(allowed: NumberToken[], token: NumberToken): boolean {
  return allowed.some((candidate) => {
    if (candidate.value !== token.value) return false
    if (token.kind === "number") return true
    if (token.kind !== candidate.kind) return false
    return token.kind !== "currency" || candidate.currency === token.currency
  })
}

/** Number claims in `after` that no source text contains. Empty means the rewrite adds no numbers. */
export function newNumbers(after: string, sources: string[]): NumberToken[] {
  const allowed = sources.flatMap(numberTokens)
  return numberTokens(after).filter((token) => !allows(allowed, token))
}
