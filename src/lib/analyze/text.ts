export const JD_MIN_CHARS = 200
export const JD_MAX_CHARS = 30_000

export function normalizeJobText(input: string): string {
  return input.replace(/\s+/g, " ").trim()
}

export function validateJobDescription(
  input: string,
): { ok: true; text: string } | { ok: false; message: string } {
  const text = normalizeJobText(input)
  if (text.length < JD_MIN_CHARS) {
    return {
      ok: false,
      message: `Paste at least ${JD_MIN_CHARS} characters of job description text.`,
    }
  }
  if (text.length > JD_MAX_CHARS) {
    return {
      ok: false,
      message: `Job description text must be ${JD_MAX_CHARS.toLocaleString("en-US")} characters or fewer.`,
    }
  }
  return { ok: true, text }
}
