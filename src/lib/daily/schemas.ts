import { z } from "zod"

import { isIsoDate, isValidTimeZone } from "@/lib/daily/calendar"

const isoDate = z.string().trim().refine((value) => value === "" || isIsoDate(value), "Use YYYY-MM-DD.")

const weekdays = z
  .array(z.coerce.number().int().min(1).max(7))
  .min(1, "Choose at least one day.")
  .max(7)
  .transform((values) => [...new Set(values)].sort((left, right) => left - right))

export const recurringTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    description: z.string().trim().max(2000).transform((value) => value || null),
    weekdays,
    startDate: isoDate.transform((value) => value || null),
    endDate: isoDate.transform((value) => value || null),
    status: z.enum(["active", "paused"]),
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  })

export const timezoneSchema = z.string().trim().refine(isValidTimeZone, "Choose a valid timezone.")

export const healthGoalsSchema = z.object({
  calorieTarget: z.string().trim(),
  proteinTarget: z.string().trim(),
  waterGoalMl: z.string().trim(),
  waterIncrementMl: z.string().trim(),
  sleepTargetMinutes: z.string().trim(),
  stepTarget: z.string().trim(),
  weightUnit: z.enum(["kg", "lb"]),
})

export function optionalNonnegative(value: string, label: string, max: number): number | null | string {
  if (!value) return null
  if (!/^\d+(\.\d+)?$/.test(value)) return `Enter a ${label} of zero or more.`
  const number = Number(value)
  if (number > max) return `${label} is too large.`
  return number
}
