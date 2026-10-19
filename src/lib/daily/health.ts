export type WeightUnit = "kg" | "lb"

const LB_PER_KG = 2.2046226218

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  const value = unit === "lb" ? kg * LB_PER_KG : kg
  return Math.round(value * 10) / 10
}

export function displayToKg(value: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? value / LB_PER_KG : value
  return Math.round(kg * 1000) / 1000
}

export function sumNumbers(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export function waterTotal(amounts: number[]): number {
  return Math.max(0, sumNumbers(amounts))
}

export function canAddWater(current: number, amount: number): boolean {
  return amount !== 0 && current + amount >= 0
}

export function sleepMinutes(hours: number, minutes: number): number | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null
  const total = hours * 60 + minutes
  if (total < 1 || total > 1440) return null
  return total
}

export function formatSleep(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours}h ${rest}m`
}

export type DailyPoint = { date: string; value: number | null }

export function normalizeSeries(points: Array<number | null>): Array<number | null> {
  const present = points.filter((value): value is number => value != null)
  if (present.length === 0) return points.map(() => null)
  const min = Math.min(...present)
  const max = Math.max(...present)
  if (min === max) return points.map((value) => (value == null ? null : 50))
  return points.map((value) => (value == null ? null : ((value - min) / (max - min)) * 100))
}

export function pointsByDate(
  dates: string[],
  rows: Array<{ date: string; value: number }>,
): DailyPoint[] {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.date, (totals.get(row.date) ?? 0) + row.value)
  return dates.map((date) => ({
    date,
    value: totals.has(date) ? totals.get(date) ?? null : null,
  }))
}
