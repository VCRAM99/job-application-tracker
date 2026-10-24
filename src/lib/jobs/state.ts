export type PostingFlags = {
  saved: boolean
  hidden: boolean
  feedback: "already_applied" | "not_interested" | null
}

export type PostingCommand =
  | "save"
  | "unsave"
  | "hide"
  | "unhide"
  | "not_interested"
  | "already_applied"
  | "clear_feedback"

export function nextPostingFlags(current: PostingFlags, command: PostingCommand): PostingFlags {
  if (command === "save") return { ...current, saved: true }
  if (command === "unsave") return { ...current, saved: false }
  if (command === "hide") return { ...current, hidden: true }
  if (command === "unhide") return { ...current, hidden: false, feedback: current.feedback === "not_interested" ? null : current.feedback }
  if (command === "not_interested") return { ...current, hidden: true, feedback: "not_interested" }
  if (command === "already_applied") return { ...current, hidden: true, feedback: "already_applied" }
  return { ...current, hidden: false, feedback: null }
}
