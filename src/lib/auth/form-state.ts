import type { AuthField } from "@/lib/auth/schemas"

export type AuthFormState = {
  status: "idle" | "error" | "success"
  message: string | null
  fieldErrors: Partial<Record<AuthField, string>>
}

export const initialAuthFormState: AuthFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
}
