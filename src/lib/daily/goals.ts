/**
 * Health targets: goal mode, protein direction, which metrics are shown, and the status shown
 * next to each total. Pure: used by the page, the preferences panel, and tests.
 */

export const GOAL_MODES = ["cut", "bulk"] as const
export type GoalMode = (typeof GOAL_MODES)[number]

export const PROTEIN_DIRECTIONS = ["follow", "reach"] as const
export type ProteinDirection = (typeof PROTEIN_DIRECTIONS)[number]

/** "food" covers calories and protein, which are logged together. */
export const HEALTH_METRICS = ["food", "water", "sleep", "steps", "weight"] as const
export type HealthMetric = (typeof HEALTH_METRICS)[number]

export const METRIC_LABELS: Record<HealthMetric, string> = {
  food: "Calories & protein",
  water: "Water",
  sleep: "Sleep",
  steps: "Steps",
  weight: "Weight",
}

/**
 * Defaults for a user with no saved choice (null columns). Bulking keeps the behavior the page
 * had before goal modes: a target was an amount to reach, and reaching or passing it showed as met.
 */
export const DEFAULT_GOAL_MODE: GoalMode = "bulk"
export const DEFAULT_PROTEIN_DIRECTION: ProteinDirection = "follow"

/** From this share of the target on, a total counts as close to it. */
export const CLOSE_RATIO = 0.9

export function parseGoalMode(value: unknown): GoalMode {
  return value === "cut" || value === "bulk" ? value : DEFAULT_GOAL_MODE
}

export function parseProteinDirection(value: unknown): ProteinDirection {
  return value === "follow" || value === "reach" ? value : DEFAULT_PROTEIN_DIRECTION
}

/** Known metric names only, without duplicates, in a stable order. */
export function parseHiddenMetrics(value: unknown): HealthMetric[] {
  if (!Array.isArray(value)) return []
  return HEALTH_METRICS.filter((metric) => value.includes(metric))
}

/**
 * - good: within a limit (cut) or reached (bulk, reach)
 * - close: within CLOSE_RATIO of the target
 * - over: past a limit (cut only)
 * - below: well short of an amount to reach (shown neutral, never as a failure)
 * - none: no target set
 */
export type TargetTone = "good" | "close" | "over" | "below" | "none"

export type TargetStatus = { tone: TargetTone; label: string; ratio: number | null }

/** How a target is read: as a limit not to pass (cut), or an amount to reach. */
export type TargetDirection = "limit" | "reach"

export function targetStatus(value: number, target: number | null, direction: TargetDirection): TargetStatus {
  if (target == null || !Number.isFinite(target) || target <= 0) return { tone: "none", label: "No target", ratio: null }
  const ratio = Math.max(0, value) / target
  if (direction === "limit") {
    if (ratio > 1) return { tone: "over", label: "Over", ratio }
    if (ratio >= CLOSE_RATIO) return { tone: "close", label: "Close", ratio }
    return { tone: "good", label: "Under", ratio }
  }
  if (ratio >= 1) return { tone: "good", label: "Reached", ratio }
  if (ratio >= CLOSE_RATIO) return { tone: "close", label: "Close", ratio }
  return { tone: "below", label: "Below", ratio }
}

/** Calories follow the goal mode: a limit when cutting, an amount to reach when bulking. */
export function calorieDirection(mode: GoalMode): TargetDirection {
  return mode === "cut" ? "limit" : "reach"
}

/** Protein follows the goal mode unless the user chose "Always reach". */
export function proteinDirection(mode: GoalMode, direction: ProteinDirection): TargetDirection {
  return direction === "reach" ? "reach" : calorieDirection(mode)
}
