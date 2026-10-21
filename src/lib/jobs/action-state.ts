export type JobActionState = {
  status: "idle" | "error" | "success"
  message: string | null
}

export const initialJobActionState: JobActionState = { status: "idle", message: null }
