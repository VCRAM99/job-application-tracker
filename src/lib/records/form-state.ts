export type RecordFormState = {
  status: "idle" | "error"
  message: string | null
  fieldErrors: Record<string, string>
}

export const initialRecordFormState: RecordFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
}

export function formText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

export function safeRecordPath(value: string, fallback: string): string {
  if (value === "/companies" || value === "/applications") return value
  const match = value.match(/^\/(companies|applications)\/([0-9a-f-]{36})$/i)
  if (match && isUuid(match[2] ?? "")) return value
  return fallback
}
