/** Draft formats and their character caps. The database checks the same caps. */
export const DRAFT_FORMATS = ["connection_note", "message", "email", "answer"] as const
export type DraftFormat = (typeof DRAFT_FORMATS)[number]

export const FORMAT_LIMITS: Record<DraftFormat, number> = {
  connection_note: 300,
  message: 1200,
  email: 2500,
  answer: 2500,
}

export const SUBJECT_MAX = 150

/**
 * Joins kept sentences into paragraphs and drops trailing sentences until the
 * body fits the cap. Each sentence carries whether a paragraph ends after it.
 */
export function fitToLimit(
  sentences: Array<{ text: string; paragraphEnd: boolean }>,
  limit: number,
): { body: string; kept: number; dropped: number } {
  const join = (items: typeof sentences) =>
    items
      .map((item, index) => item.text + (index === items.length - 1 ? "" : item.paragraphEnd ? "\n\n" : " "))
      .join("")
  let kept = [...sentences]
  while (kept.length > 0 && join(kept).length > limit) kept = kept.slice(0, -1)
  return { body: join(kept), kept: kept.length, dropped: sentences.length - kept.length }
}
