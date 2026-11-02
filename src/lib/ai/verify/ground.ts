import { normalizeJobText } from "@/lib/analyze/text"
import { groundingKey } from "@/lib/resume/parse"

export const QUOTE_BOUNDS = { min: 12, max: 400 }

/**
 * M3's rule for one quote: after whitespace normalization (and M4's case,
 * quote, and dash folding) the quote must appear in the source as written.
 * Returns the span in the folded source, or null when it is not there.
 */
export function groundQuote(source: string, quote: string): { quote: string; start: number; end: number } | null {
  const normalized = normalizeJobText(quote)
  if (normalized.length < QUOTE_BOUNDS.min || normalized.length > QUOTE_BOUNDS.max) return null
  const key = groundingKey(normalized)
  const start = groundingKey(source).indexOf(key)
  if (start < 0) return null
  return { quote: normalized, start, end: start + key.length }
}
